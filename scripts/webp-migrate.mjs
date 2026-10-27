#!/usr/bin/env node
/**
 * 기존 이미지 오브젝트를 전면 webp로 옮기는 일회성 마이그레이션 (ADR-0035 결정 6, DERO-576).
 *
 * 2026-08-05의 `webp-backfill.mjs`와 무엇이 다른가
 * - 그 스크립트는 **같은 key에 덮어썼다**(확장자는 .png인데 내용은 webp). DB·백엔드 변경 0이 목적이었다.
 *   ADR-0035는 key 자체를 .webp로 바꾸므로 **새 key로 올리고 DB를 고친다** — 그래서 DB 접속이 필요하다.
 * - 스캔 기준이 S3 프리픽스가 아니라 **DB**다. V12 재이관으로 `desk_feed_image`가 `post-images/`를
 *   참조하는 행이 실존해서 프리픽스로 거르면 대상이 어긋난다(erd.md desk_feed_image 절).
 *   본문 마크다운 인라인 이미지(`post.content`·`desk_feed.content`의 `![alt](key)`)도 같은 이유로 훑는다.
 * - 원본 백업 프리픽스가 다르다: 이번은 `_backup-pre-webp/`(ADR-0035), 지난번은 `originals/`.
 *
 * 운영 실행 절차 (이 순서를 지킨다 — 코드 배포가 먼저다)
 *   ① 신규 업로드 webp화 코드(571~575)를 운영에 배포한다. 배포 전에 돌리면 구버전 WAS가 다시 png를 쓴다.
 *   ② SSH 터널을 연다: ssh -i <key> -N -L 55432:<rds-host>:5432 ec2
 *   ③ 드라이런: node scripts/webp-migrate.mjs
 *   ④ 실행:     node scripts/webp-migrate.mjs --execute
 *   ⑤ 박동규 시각 QA(홈·제품 상세·데스크피드·프로필) 통과를 받는다.
 *   ⑥ 원본 삭제: node scripts/webp-migrate.mjs --delete-originals --execute
 *
 * 그 밖의 플래그
 *   --limit <n>    앞에서 n개만 처리한다(운영 첫 실행에서 소수로 확인할 때).
 *   --self-check   접속 없이 key 유도·분류 규칙만 검증한다.
 *
 * 준비물
 *   npm install                                     # 레포 루트 — sharp·pg
 *   export DATABASE_URL=postgres://deroroot:<pw>@localhost:55432/dero_db
 *   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=... AWS_S3_BUCKET=...
 *   자격증명 값은 운영 .env(Jenkins 워크스페이스가 정본)에서 가져온다. 코드에 넣지 않는다.
 *
 * 안전장치
 * - 기본이 드라이런이다. `--execute` 없이는 S3에도 DB에도 쓰지 않는다.
 * - 순서: 백업 복사 → 새 key 업로드 → **그 다음에** DB UPDATE. key 하나가 한 트랜잭션이라 중간에 죽어도
 *   DB는 항상 "존재하는 오브젝트"를 가리킨다. 재실행하면 남은 것만 이어서 한다.
 * - 이미 .webp인 key는 건너뛴다. 백업이 이미 있으면 다시 복사하지 않는다(멱등).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { Client } = require('pg');

// 프론트 업로드 변환과 같은 값을 쓴다(imageCompression.ts의 COMPRESSED_LONG_EDGE·COMPRESSED_QUALITY)
// — 같은 버킷의 같은 사진에 두 가지 화질이 섞이면 안 된다. 0.82 ↔ 82로 표기만 다르다.
const EDGE = 1280;
const QUALITY = 82;
const BACKUP_PREFIX = '_backup-pre-webp/';
/** 이미지가 아니라 대상이 아닌 프리픽스. GLB·KTX2·약관 + 두 종류의 백업본. */
const SKIP_PREFIXES = ['assets/', 'desk-textures/', 'terms/', BACKUP_PREFIX, 'originals/'];
const CONVERTIBLE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp']);

/** `_key` 컬럼 전량. 여기 빠지면 그 이미지는 영원히 png로 남는다 — erd.md와 대조하며 늘린다. */
const KEY_COLUMNS = [
	{ table: '"user"', column: 'profile_image_key' },
	{ table: 'placement', column: 'thumbnail_key' },
	{ table: 'generated_image', column: 'image_key' },
	{ table: 'desk_feed_image', column: 'image_key' },
	{ table: 'post_image', column: 'image_key' },
	{ table: 'product_image', column: 'image_key' },
	{ table: 'brand', column: 'logo_image_key' },
];

/** 본문 마크다운에 key가 그대로 박히는 테이블(ADR-0013 결정 5의 `![alt](key)` 직렬화). */
const CONTENT_COLUMNS = [
	{ table: 'post', column: 'content' },
	{ table: 'desk_feed', column: 'content' },
];

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (flag('--help') || flag('-h')) {
	console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
	process.exit(0);
}

// key 유도가 틀리면 DB가 없는 오브젝트를 가리킨다 — 접속 없이 그 부분만 확인한다.
if (flag('--self-check')) {
	const { strict: assert } = await import('node:assert');
	const uuidTail = /\/[0-9a-f-]{36}\.webp$/;
	assert.equal(newKeyFor('post-images/7/6f1c.png'), 'post-images/7/6f1c.webp');
	assert.equal(newKeyFor('generated-images/6f1c.png'), 'generated-images/6f1c.webp');
	// 구형 결정론 key 2종만 {프리픽스}/{id}/{uuid}.webp로 승격한다.
	assert.match(newKeyFor('profile-images/415.jpg'), /^profile-images\/415\//);
	assert.match(newKeyFor('profile-images/415.jpg'), uuidTail);
	assert.match(newKeyFor('placement-thumbnails/12.png'), uuidTail);
	assert.equal(classify('product-images/3/a.png'), 'target');
	assert.equal(classify('product-images/3/a.webp'), 'done');
	assert.equal(classify('assets/desk.glb'), 'excluded');
	assert.equal(classify('_backup-pre-webp/product-images/3/a.png'), 'excluded');
	assert.deepEqual(
		[...'![a](post-images/7/x.png) ![b](https://cdn/y.png)'.matchAll(MARKDOWN_IMAGE)].map((m) => m[1]),
		['post-images/7/x.png', 'https://cdn/y.png']);

	// 백필분(key는 .png인데 내용이 이미 webp·1280 이하)은 **같은 버퍼 그대로** 나와야 한다.
	// 새 버퍼가 나오면 재인코딩됐다는 뜻이고 그게 곧 2세대 손실이다.
	const gray = { channels: 3, background: '#888888' };
	const backfilled = await sharp({ create: { width: 800, height: 600, ...gray } })
		.webp({ quality: QUALITY }).toBuffer();
	assert.equal(await convert(backfilled, 'png'), backfilled);
	// 진짜 원본은 1280으로 줄여 재인코딩한다.
	const original = await sharp({ create: { width: 2400, height: 1350, ...gray } }).png().toBuffer();
	const converted = await convert(original, 'png');
	assert.notEqual(converted, original);
	assert.deepEqual(
		await sharp(converted).metadata().then((m) => [m.format, m.width]),
		['webp', EDGE]);

	console.log('self-check ok');
	process.exit(0);
}

const EXECUTE = flag('--execute');
const DELETE_ORIGINALS = flag('--delete-originals');
const LIMIT = Number(opt('--limit', '0')) || 0;
const BUCKET = process.env.AWS_S3_BUCKET;
const DATABASE_URL = process.env.DATABASE_URL;

for (const [name, value] of [
	['DATABASE_URL', DATABASE_URL],
	['AWS_S3_BUCKET', BUCKET],
	['AWS_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID],
	['AWS_SECRET_ACCESS_KEY', process.env.AWS_SECRET_ACCESS_KEY],
	['AWS_REGION', process.env.AWS_REGION],
]) {
	if (!value) {
		console.error(`${name} 환경변수가 필요하다. 스크립트 상단 "준비물" 주석을 본다.`);
		process.exit(2);
	}
}

/** aws CLI 호출. 실패 시 stderr를 메시지에 실어 던진다 — 안 그러면 원인이 로그에 안 남는다. */
const aws = (args, extra = {}) => {
	try {
		return execFileSync('aws', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra });
	} catch (e) {
		const detail = (e.stderr || '').toString().trim().split('\n').slice(-2).join(' ');
		throw new Error(`${args[1]} ${args[2] ?? ''} 실패: ${detail || e.message.split('\n')[0]}`);
	}
};

/** 일시적 실패(스로틀링·연결 끊김)를 한 번 다시 시도한다. 지난 백필에서 314개 중 4개가 이렇게 샜다. */
const retry = async (fn) => {
	try {
		return await fn();
	} catch (first) {
		await new Promise((r) => setTimeout(r, 1500));
		try {
			return await fn();
		} catch {
			throw first;
		}
	}
};

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
// 함수 선언이다 — 위쪽 --self-check가 호이스팅에 기댄다.
function extOf(key) {
	const base = key.slice(key.lastIndexOf('/') + 1);
	return base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
}
const objectExists = (key) => {
	try {
		aws(['s3api', 'head-object', '--bucket', BUCKET, '--key', key, '--output', 'text',
			'--query', 'ContentLength'], { stdio: ['ignore', 'pipe', 'pipe'] });
		return true;
	} catch {
		return false;
	}
};
const copySource = (key) => `${BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

/**
 * 새 key. **확장자만 .webp로 바꾸고 uuid 자리는 유지한다** — 그래야 같은 글의 사진들이 같은 폴더에 남는다.
 *
 * 예외는 구형 결정론 key 2종이다(`profile-images/{userId}.png`·`placement-thumbnails/{id}.png`).
 * 파일명이 숫자 id뿐이라 그대로 확장자만 갈면 여전히 덮어쓰기 key이고, immutable 캐시와 양립하지 않는다
 * (ADR-0035 결정 3). 그래서 다른 프리픽스와 같은 `{프리픽스}/{id}/{uuid}.webp` 신형으로 승격한다.
 */
function newKeyFor(oldKey) {
	const slash = oldKey.lastIndexOf('/');
	const dot = oldKey.lastIndexOf('.');
	const stem = dot > slash ? oldKey.slice(0, dot) : oldKey;
	const name = stem.slice(slash + 1);
	return /^\d+$/.test(name) ? `${stem}/${randomUUID()}.webp` : `${stem}.webp`;
}

/** 대상 판정을 한 곳에 모은다 — 흩어지면 다음 사람이 다르게 읽는다. */
function classify(key) {
	if (SKIP_PREFIXES.some((p) => key.startsWith(p))) return 'excluded';
	const ext = extOf(key);
	if (ext === 'webp') return 'done';
	if (!CONVERTIBLE_EXT.has(ext)) return 'excluded';
	return 'target';
}

async function convert(buf, ext) {
	// 2026-08-05 백필이 **라이브 key에 webp 내용을 덮어써** 둔 오브젝트가 있다(key는 .png인데
	// 내용은 webp 1280/q80, 2026-08-11 실측 314개). classify()는 key 확장자로 판정하므로 이들을
	// target으로 잡는데, 그대로 재인코딩하면 손실 압축을 2세대 먹인다. 내용이 이미 목표 상태면
	// 바이트를 그대로 옮긴다 — 확장자·Content-Type·DB만 정리된다.
	const meta = await sharp(buf).metadata();
	if (meta.format === 'webp' && meta.width <= EDGE && meta.height <= EDGE) return buf;

	// GIF는 프레임을 전부 읽어 animated webp로 낸다. animated:true 없이 넣으면 1프레임만 남는다.
	return sharp(buf, ext === 'gif' ? { animated: true } : {})
		.resize({ width: EDGE, height: EDGE, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: QUALITY })
		.toBuffer();
}

const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

/**
 * DB 전체에서 이미지 key 참조를 모은다. 같은 key를 여러 행이 가리킬 수 있으므로
 * key → 참조 목록으로 접는다(오브젝트 작업은 key당 한 번, DB UPDATE는 참조마다).
 */
async function collectReferences() {
	const byKey = new Map();
	const add = (key, ref) => {
		if (!byKey.has(key)) byKey.set(key, []);
		byKey.get(key).push(ref);
	};

	for (const { table, column } of KEY_COLUMNS) {
		const { rows } = await db.query(
			`SELECT id, ${column} AS key FROM ${table} WHERE ${column} IS NOT NULL`);
		for (const row of rows) add(row.key, { kind: 'column', table, column, id: row.id });
	}

	for (const { table, column } of CONTENT_COLUMNS) {
		const { rows } = await db.query(
			`SELECT id, ${column} AS content FROM ${table} WHERE ${column} IS NOT NULL`);
		for (const row of rows) {
			for (const [, key] of row.content.matchAll(MARKDOWN_IMAGE)) {
				// 외부 링크는 우리 오브젝트가 아니다.
				if (/^(https?:)?\/\//.test(key) || key.startsWith('/')) continue;
				add(key, { kind: 'content', table, column, id: row.id });
			}
		}
	}
	return byKey;
}

/** 오브젝트 업로드가 끝난 뒤에만 부른다. key 하나가 한 트랜잭션이다. */
async function repointReferences(oldKey, newKey, refs) {
	await db.query('BEGIN');
	try {
		for (const ref of refs) {
			if (ref.kind === 'column') {
				await db.query(
					`UPDATE ${ref.table} SET ${ref.column} = $1 WHERE id = $2 AND ${ref.column} = $3`,
					[newKey, ref.id, oldKey]);
			} else {
				await db.query(
					`UPDATE ${ref.table} SET ${ref.column} = replace(${ref.column}, $1, $2) WHERE id = $3`,
					[oldKey, newKey, ref.id]);
			}
		}
		await db.query('COMMIT');
	} catch (e) {
		await db.query('ROLLBACK');
		throw e;
	}
}

const scratch = mkdtempSync(join(tmpdir(), 'webp-migrate-'));

async function migrateOne(oldKey, refs, index, total) {
	const tag = `[${String(index + 1).padStart(3)}/${total}] ${oldKey}`;
	const src = join(scratch, `src-${index}`);
	await retry(() => aws(['s3api', 'get-object', '--bucket', BUCKET, '--key', oldKey, src],
		{ stdio: ['ignore', 'ignore', 'pipe'] }));
	const input = readFileSync(src);

	let out;
	try {
		out = await convert(input, extOf(oldKey));
	} finally {
		rmSync(src, { force: true });
	}

	const newKey = newKeyFor(oldKey);
	if (!EXECUTE) {
		console.log(`${tag}\n     → ${newKey}  ${kb(input.length)} → ${kb(out.length)}  참조 ${refs.length}곳  [드라이런]`);
		return { status: 'would-migrate', before: input.length, after: out.length };
	}

	// 순서가 중요하다 — 백업을 확보한 다음에만 새 오브젝트를 올리고, 올라간 다음에만 DB를 돌린다.
	if (!objectExists(BACKUP_PREFIX + oldKey)) {
		await retry(() => aws(['s3api', 'copy-object', '--bucket', BUCKET,
			'--copy-source', copySource(oldKey), '--key', BACKUP_PREFIX + oldKey, '--output', 'json'],
			{ stdio: ['ignore', 'ignore', 'pipe'] }));
	}

	const dst = join(scratch, `out-${index}.webp`);
	writeFileSync(dst, out);
	try {
		await retry(() => aws(['s3api', 'put-object', '--bucket', BUCKET, '--key', newKey,
			'--body', dst, '--content-type', 'image/webp', '--output', 'json'],
			{ stdio: ['ignore', 'ignore', 'pipe'] }));
	} finally {
		rmSync(dst, { force: true });
	}

	await repointReferences(oldKey, newKey, refs);
	console.log(`${tag}\n     → ${newKey}  ${kb(input.length)} → ${kb(out.length)}  참조 ${refs.length}곳`);
	return { status: 'migrated', before: input.length, after: out.length };
}

/**
 * 3단계 — 시각 QA 통과 후 원본을 지운다. 지울 목록은 `_backup-pre-webp/` 목록 자체가 정본이라
 * 중간 상태 파일이 필요 없다. **DB가 아직 참조하는 key는 지우지 않는다** — 마이그레이션이 덜 끝났거나
 * 롤백된 것이므로 여기서 지우면 화면이 깨진다.
 */
async function deleteOriginals() {
	const live = new Set((await collectReferences()).keys());
	const raw = aws(['s3api', 'list-objects-v2', '--bucket', BUCKET, '--prefix', BACKUP_PREFIX,
		'--output', 'json', '--query', 'Contents[].Key']);
	const backups = JSON.parse(raw) ?? [];

	let deleted = 0;
	let held = 0;
	for (const backupKey of backups) {
		const originalKey = backupKey.slice(BACKUP_PREFIX.length);
		if (live.has(originalKey)) {
			console.log(`보류 ${originalKey} — DB가 아직 참조 중`);
			held += 1;
			continue;
		}
		if (EXECUTE) {
			for (const key of [originalKey, backupKey]) {
				await retry(() => aws(['s3api', 'delete-object', '--bucket', BUCKET, '--key', key,
					'--output', 'json'], { stdio: ['ignore', 'ignore', 'pipe'] }));
			}
		}
		console.log(`${EXECUTE ? '삭제' : '삭제 예정'} ${originalKey} (+ 백업본)`);
		deleted += 1;
	}
	console.log(`\n백업 ${backups.length}개 · ${EXECUTE ? '삭제' : '삭제 예정'} ${deleted}개 · 보류 ${held}개`);
	if (!EXECUTE) console.log('실제로 지우려면 --execute를 붙인다.');
}

console.log(`버킷 ${BUCKET} · DB ${DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@')}`);
console.log(EXECUTE ? '모드: 실행 — S3와 DB에 씁니다\n' : '모드: 드라이런 — 쓰기 없음\n');

if (DELETE_ORIGINALS) {
	await deleteOriginals();
	await db.end();
	rmSync(scratch, { recursive: true, force: true });
	process.exit(0);
}

const references = await collectReferences();
const buckets = { target: [], done: [], excluded: [] };
for (const [key, refs] of references) buckets[classify(key)].push([key, refs]);

let targets = buckets.target;
if (LIMIT) targets = targets.slice(0, LIMIT);

console.log(`DB 참조 key ${references.size}개 — 대상 ${buckets.target.length} · 이미 webp ${buckets.done.length} · 제외 ${buckets.excluded.length}`);
console.log(`설정: 긴 변 ${EDGE}px 상한 · webp q${QUALITY} · 백업 ${BACKUP_PREFIX}\n`);

// 알려진 비이미지 프리픽스가 아닌데 제외된 key는 조용히 넘어가면 안 된다 — 확장자가 없거나
// 우리가 모르는 포맷이라는 뜻이고, 그대로 두면 그 이미지만 영영 png로 남는다.
const unexpected = buckets.excluded.filter(([k]) => !SKIP_PREFIXES.some((p) => k.startsWith(p)));
if (unexpected.length) {
	console.log(`확인 필요 — 이미지 프리픽스인데 변환 대상이 아닌 key ${unexpected.length}개:`);
	for (const [k] of unexpected) console.log(`  ${k}`);
	console.log('');
}

// ponytail: 순차 처리. 중간에 죽어도 재실행으로 이어붙는 것이 6배 빠른 것보다 중요하다.
// 수백 장 규모에서 수십 분이 문제가 되면 pg.Pool + 워커 풀로 올린다(webp-backfill.mjs의 pool 참고).
const results = [];
for (const [index, [key, refs]] of targets.entries()) {
	try {
		results.push(await migrateOne(key, refs, index, targets.length));
	} catch (e) {
		console.log(`[${index + 1}] ${key}  실패 — ${e.message.split('\n')[0]}`);
		results.push({ status: 'error', before: 0, after: 0, key });
	}
}

rmSync(scratch, { recursive: true, force: true });
await db.end();

const changed = results.filter((r) => r.status === 'migrated' || r.status === 'would-migrate');
const before = changed.reduce((a, r) => a + r.before, 0);
const after = changed.reduce((a, r) => a + r.after, 0);
const errors = results.filter((r) => r.status === 'error');

console.log('\n' + '-'.repeat(66));
console.log(`${EXECUTE ? '이관' : '이관 예정'} ${changed.length}개 · ${mb(before)} → ${mb(after)} · 절감 ${mb(before - after)}` +
	(before ? ` (${((100 * (before - after)) / before).toFixed(1)}%)` : ''));
if (errors.length) {
	console.log(`\n실패 ${errors.length}개 — 재실행하면 이 key만 다시 시도한다:`);
	for (const e of errors) console.log(`  ${e.key}`);
	process.exitCode = 1;
}
if (!EXECUTE) console.log('\n실제로 쓰려면 --execute를 붙인다.');
