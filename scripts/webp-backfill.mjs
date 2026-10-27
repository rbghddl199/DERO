#!/usr/bin/env node
/**
 * S3에 이미 올라간 이미지를 webp로 재인코딩하는 일회성 백필.
 *
 * 왜 이 형태인가
 * - 화면에 이미지가 늦게 뜨는 원인은 파일 크기 하나였다. presigned URL이 매 요청 재생성되는 것은
 *   원인이 아니다(SigV4 presign은 네트워크를 타지 않는 로컬 HMAC 계산이다). 그래서 URL 방식·버킷 정책·
 *   프론트 코드는 건드리지 않고 버킷 안의 바이트만 바꾼다.
 * - **같은 key에 덮어쓴다.** Content-Type을 image/webp로 명시해 PUT하면 읽기는 presigned GET이라
 *   S3가 저장된 그 값을 그대로 돌려준다. S3StoragePort.contentTypeOf(key)의 확장자 추정은 store
 *   시점에만 쓰이고 읽기 경로에 없어서 부딪히지 않는다. 덕분에 DB·백엔드·프론트 변경이 0이다.
 *   대가는 key 확장자가 .png인데 내용이 webp라 사람이 보고 오해할 수 있는 것 하나다.
 * - 원본은 지우지 않고 originals/<key>로 복사해 남긴다. 배치 버그 하나에 전량 손실이 되는 것을 막는
 *   안전판이고, originals/ 존재 여부가 그대로 멱등성 판정에도 쓰인다.
 *
 * 대상 규칙 (2026-08-05 실측 기반)
 * - PNG는 전부. product-images/의 PNG 179장이 그 접두사 342.6MB의 90.5%를 차지한다 — 사진을
 *   무손실 PNG로 저장한 것이 진짜 원인이다.
 * - 비-PNG(jpg/jpeg/webp)는 1MB 초과인 것만. 나머지 306장은 중앙값 91KB로 이미 작고, 재인코딩하면
 *   이중 압축으로 화질만 깎인다. 실측상 1MB 초과는 profile-images/415.jpg 한 장뿐이다.
 * - 이미지가 아닌 접두사(assets/ GLB, desk-textures/ KTX2, terms/ md)와 originals/는 제외한다.
 *
 * 사용법 (repo 루트에서)
 *   node scripts/webp-backfill.mjs                  # 드라이런 — 쓰기 없음
 *   node scripts/webp-backfill.mjs --execute        # 실제 실행
 *   node scripts/webp-backfill.mjs --prefix product-images/ --limit 5 --execute
 *
 * 자격증명은 표준 AWS 환경변수를 쓴다. dero 계정 값은 backend/dero-api/.env.local에 있다
 * (~/.aws/credentials의 default는 다른 계정이라 쓰면 안 된다).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// sharp는 프론트 의존성을 재사용한다. 이 스크립트 하나 때문에 루트에 의존성을 새로 넣지 않는다.
const sharp = createRequire(import.meta.url)('../frontend/node_modules/sharp');

const EDGE = 1280;
const QUALITY = 82;
const NON_PNG_MIN_BYTES = 1024 * 1024;
const ORIGINALS_PREFIX = 'originals/';
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const CONCURRENCY = 6;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const EXECUTE = flag('--execute');
const ONLY_PREFIX = opt('--prefix', null);
const LIMIT = Number(opt('--limit', '0')) || 0;
const BUCKET = process.env.AWS_S3_BUCKET || opt('--bucket', null);

if (!BUCKET) {
	console.error('AWS_S3_BUCKET 환경변수 또는 --bucket <name>이 필요하다.');
	process.exit(2);
}

/**
 * aws CLI 호출. 실패 시 stderr를 메시지에 실어 던진다 — 이것 없이는 실패 로그가
 * "Command failed: aws s3api ..."로만 남아 원인을 못 찾는다(2026-08-05 1차 실행에서 겪음).
 */
const aws = (args, extra = {}) => {
	try {
		return execFileSync('aws', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra });
	} catch (e) {
		const detail = (e.stderr || '').toString().trim().split('\n').slice(-2).join(' ');
		throw new Error(`${args[1]} ${args[2] ?? ''} 실패: ${detail || e.message.split('\n')[0]}`);
	}
};

/** 일시적 실패(스로틀링·연결 끊김)를 한 번 다시 시도한다. 1차 실행에서 314개 중 4개가 이렇게 샜다. */
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
const extOf = (key) => {
	const base = key.slice(key.lastIndexOf('/') + 1);
	return base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
};

/** 대상 규칙을 한 곳에 모은다 — 판정이 흩어지면 다음 사람이 다르게 읽는다. */
function isTarget(key, size) {
	if (key.startsWith(ORIGINALS_PREFIX)) return false;
	const ext = extOf(key);
	if (!IMAGE_EXT.has(ext)) return false;
	if (ext === 'png') return true;
	return size > NON_PNG_MIN_BYTES;
}

function listAll() {
	const raw = aws([
		's3api', 'list-objects-v2', '--bucket', BUCKET,
		'--output', 'json', '--query', 'Contents[].{k:Key,s:Size}',
	]);
	return JSON.parse(raw) ?? [];
}

/**
 * 이미 처리됐는지를 **대상 키의 Content-Type이 image/webp인가**로 판정한다.
 *
 * originals/ 존재 여부로 판정하면 안 된다 — copy는 성공하고 put이 실패한 오브젝트가
 * 영구히 skip되어 원본 크기로 남는다(1차 실행에서 이 구멍이 실제로 드러났고, 그때는
 * 운 좋게 put이 실제로는 성공해서 사고가 되지 않았다). 원하는 최종 상태를 직접 확인하는
 * 편이 프록시 지표보다 정확하고, 호출 수도 같다.
 */
function alreadyWebp(key) {
	try {
		const out = aws(['s3api', 'head-object', '--bucket', BUCKET, '--key', key,
			'--query', 'ContentType', '--output', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] });
		return out.trim() === 'image/webp';
	} catch {
		return false;
	}
}

async function convert(buf) {
	return sharp(buf)
		.resize({ width: EDGE, height: EDGE, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: QUALITY })
		.toBuffer();
}

const scratch = mkdtempSync(join(tmpdir(), 'webp-backfill-'));

async function processOne(obj, index, total) {
	const { k: key, s: size } = obj;
	const tag = `[${String(index + 1).padStart(3)}/${total}] ${key}`;

	if (alreadyWebp(key)) return { key, status: 'skip-done', before: size, after: size };

	const src = join(scratch, `src-${index}`);
	await retry(() => aws(['s3api', 'get-object', '--bucket', BUCKET, '--key', key, src],
		{ stdio: ['ignore', 'ignore', 'pipe'] }));
	const input = readFileSync(src);

	let out;
	try {
		out = await convert(input);
	} catch (e) {
		rmSync(src, { force: true });
		console.log(`${tag}  변환 실패 — ${e.message.split('\n')[0]}`);
		return { key, status: 'error', before: size, after: size, error: e.message };
	}

	// 결과가 더 크면 건드리지 않는다. 이미 잘 압축된 파일에 손해를 끼치지 않기 위한 안전판이다.
	if (out.length >= input.length) {
		rmSync(src, { force: true });
		console.log(`${tag}  ${kb(size)} → ${kb(out.length)}  증가하므로 건너뜀`);
		return { key, status: 'skip-larger', before: size, after: size };
	}

	if (!EXECUTE) {
		rmSync(src, { force: true });
		console.log(`${tag}  ${kb(size)} → ${kb(out.length)}  (${((100 * out.length) / size).toFixed(1)}%)  [드라이런]`);
		return { key, status: 'would-write', before: size, after: out.length };
	}

	// 순서가 중요하다 — 원본 사본을 확보한 다음에만 덮어쓴다.
	await retry(() => aws(['s3api', 'copy-object', '--bucket', BUCKET,
		'--copy-source', `${BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
		'--key', ORIGINALS_PREFIX + key, '--output', 'json'], { stdio: ['ignore', 'ignore', 'pipe'] }));

	const dst = join(scratch, `out-${index}.webp`);
	writeFileSync(dst, out);
	await retry(() => aws(['s3api', 'put-object', '--bucket', BUCKET, '--key', key,
		'--body', dst, '--content-type', 'image/webp', '--output', 'json'], { stdio: ['ignore', 'ignore', 'pipe'] }));

	rmSync(src, { force: true });
	rmSync(dst, { force: true });
	console.log(`${tag}  ${kb(size)} → ${kb(out.length)}  (${((100 * out.length) / size).toFixed(1)}%)`);
	return { key, status: 'written', before: size, after: out.length };
}

async function pool(items, worker, size) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(size, items.length) }, async () => {
			while (true) {
				const i = next++;
				if (i >= items.length) return;
				try {
					results[i] = await worker(items[i], i, items.length);
				} catch (e) {
					results[i] = { key: items[i].k, status: 'error', before: items[i].s, after: items[i].s, error: e.message };
					console.log(`[${i + 1}] ${items[i].k}  실패 — ${e.message.split('\n')[0]}`);
				}
			}
		})
	);
	return results;
}

const all = listAll();
let targets = all.filter((o) => isTarget(o.k, o.s));
if (ONLY_PREFIX) targets = targets.filter((o) => o.k.startsWith(ONLY_PREFIX));
if (LIMIT) targets = targets.slice(0, LIMIT);

console.log(`버킷 ${BUCKET}`);
console.log(`전체 ${all.length}개 중 대상 ${targets.length}개 · ${mb(targets.reduce((a, o) => a + o.s, 0))}`);
console.log(`설정: 긴 변 ${EDGE}px 상한 · webp q${QUALITY} · 비-PNG는 ${mb(NON_PNG_MIN_BYTES)} 초과만`);
console.log(EXECUTE ? '모드: 실행 — S3에 씁니다\n' : '모드: 드라이런 — 쓰기 없음\n');

const results = await pool(targets, processOne, CONCURRENCY);
rmSync(scratch, { recursive: true, force: true });

const by = (s) => results.filter((r) => r.status === s);
const changed = [...by('written'), ...by('would-write')];
const before = changed.reduce((a, r) => a + r.before, 0);
const after = changed.reduce((a, r) => a + r.after, 0);

console.log('\n' + '-'.repeat(66));
console.log(`처리 ${changed.length}개 · ${mb(before)} → ${mb(after)} · 절감 ${mb(before - after)}` +
	(before ? ` (${((100 * (before - after)) / before).toFixed(1)}%)` : ''));
for (const s of ['skip-done', 'skip-larger', 'error']) {
	const n = by(s).length;
	if (n) console.log(`${s}: ${n}개`);
}
const errors = by('error');
if (errors.length) {
	console.log('\n실패한 key:');
	for (const e of errors) console.log(`  ${e.key}`);
	process.exitCode = 1;
}
if (!EXECUTE) console.log('\n실제로 쓰려면 --execute를 붙인다.');
