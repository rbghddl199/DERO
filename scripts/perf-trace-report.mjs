#!/usr/bin/env node
/**
 * Chrome DevTools 트레이스(.json)에서 에픽 606(시뮬레이터 로드 성능) before/after 비교값을 뽑는다.
 * 리소스 종류별 전송 바이트 · 종류별 페치 구간 · 메인스레드 롱태스크, 세 가지가 전부다.
 *
 * 왜 이 형태인가 (DERO-610 — 원래 티켓은 "nginx에 Timing-Allow-Origin 추가"였다)
 * - **그 헤더는 넣을 수 없고, 넣을 필요도 없다.** GLB는 nginx를 지나지 않는다 — presigned S3
 *   직행이고(`dero-s3-...s3.ap-northeast-2.amazonaws.com/assets/…glb`) S3는 객체 응답에 임의
 *   헤더를 붙이는 기능이 없다. HDR은 반대로 이미 동일 오리진(`www.dero.life/assets/env/*.hdr`)이라
 *   헤더가 필요 없다.
 * - **트레이스에는 크로스오리진 바이트가 이미 다 있다.** `Timing-Allow-Origin`이 막는 것은 페이지
 *   JS의 `PerformanceResourceTiming.transferSize`뿐이고, DevTools 트레이스의
 *   `ResourceFinish.encodedDataLength`는 막지 않는다(2026-08-11 실측: presigned S3 GLB 6건이
 *   389921·382361·380205·305449·286825·172697 바이트로 그대로 나왔다). 그래서 인프라를 건드리는
 *   대신 트레이스를 읽는다.
 * - 파싱을 스크립트로 고정하는 이유는 숫자 하나가 아니라 **재현 가능한 같은 계산**이 필요해서다.
 *   607·608·609가 각각 폰트·API 폭포·메인스레드를 건드리므로, before/after를 같은 잣대로 재야 한다.
 *
 * `ResourceFinish.encodedDataLength` 하나만 보면 안 된다 (2026-08-11 실측)
 *   같은 트레이스 안에서 두 형식이 섞인다. GLB는 `finish = 헤더 + 본문`으로 총량이 오지만,
 *   HDR은 `finish = 183`(헤더뿐, 본문 1.6MB는 `ResourceReceivedData` 청크에만 있다)이고 폰트는
 *   `finish = 0`이다. 그래서 **finish 값과 "응답 헤더 + 청크 합" 중 큰 쪽**을 전송량으로 쓴다.
 *   finish만 믿으면 폰트 2.0MB와 HDR 1.6MB가 0으로 사라져 "이미 작다"는 거짓 판정이 나온다 —
 *   에픽 606이 잡으려는 항목이 정확히 그 둘이다.
 *
 * 캐시된 응답을 전송량에 섞지 않는다
 *   워엄 런에서는 304·메모리 캐시가 바이트를 안 쓴다. 그것을 전송량에 더하면 반대로 "개선됐다"는
 *   거짓 판정이 나온다. 그래서 캐시 히트는 전송 합계에서 빼고 `캐시` 열에 따로 센다.
 *   **before/after는 같은 캐시 조건에서 뜬 트레이스끼리만 비교해야 한다.**
 *
 * 사용법 (repo 루트에서)
 *   node scripts/perf-trace-report.mjs <trace.json>
 *   node scripts/perf-trace-report.mjs <trace.json> --top 20 --longtask-ms 100
 *   node scripts/perf-trace-report.mjs --selftest        # 합성 트레이스로 집계 로직 검증
 *
 * 트레이스 뜨는 법: 시뮬레이터 페이지에서 DevTools Performance 녹화 → 우상단 내리기 버튼(Save
 * profile). Lighthouse 트레이스도 같은 형식이라 그대로 먹는다. 캐시 조건은 Network 탭
 * `Disable cache` 체크로 콜드/워엄을 갈라 준다.
 *
 * 에이전트가 직접 뜰 때는 chrome-devtools MCP가 필요하다(ecc 플러그인 제거로 상시 배선이
 * 사라졌다 — ADR-0042). 측정할 때만 임시로 붙이고 끝나면 뗀다:
 *   claude mcp add chrome-devtools -s local -- npx -y chrome-devtools-mcp@latest
 *   claude mcp remove chrome-devtools -s local
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BUCKETS = [
	['glb', (u) => /\.glb(\?|$)/i.test(u)],
	['hdr', (u) => /\.hdr(\?|$)/i.test(u)],
	['texture', (u) => /\.(ktx2|basis)(\?|$)/i.test(u)],
	['font', (u) => /\.(woff2?|ttf|otf)(\?|$)/i.test(u)],
	['wasm', (u) => /\.wasm(\?|$)/i.test(u)],
	['js', (u) => /\.m?js(\?|$)/i.test(u)],
	['css', (u) => /\.css(\?|$)/i.test(u)],
	['image', (u) => /\.(png|jpe?g|webp|avif|svg|gif)(\?|$)/i.test(u)],
	['api', (u) => /\/api\//.test(u)],
];

// 실패·취소된 요청은 encodedDataLength가 -1로 온다(실측 4건). 그대로 더하면 합계가 줄어든다.
const bytes = (n) => Math.max(0, n ?? 0);

function bucketOf(url, resourceType) {
	for (const [name, match] of BUCKETS) if (match(url)) return name;
	if (resourceType === 'Document') return 'document';
	return 'other';
}

/**
 * traceEvents 배열 → 집계 결과. 순수 함수라 --selftest가 이 함수만 때린다.
 */
function aggregate(events, { longTaskMs = 50 } = {}) {
	const requests = new Map(); // requestId → 요청 1건
	let mainPid = null;
	let t0 = null;

	for (const e of events) {
		const data = e.args?.data;
		switch (e.name) {
			case 'navigationStart':
				// 최상위 메인 프레임의 것만 t0로 쓴다. iframe·프리렌더의 navigationStart가 섞이면
				// 기준선이 앞으로 밀려 모든 구간이 음수로 나온다.
				if (data?.isOutermostMainFrame && t0 === null) {
					t0 = e.ts;
					mainPid = e.pid;
				}
				break;
			case 'ResourceSendRequest':
				if (!data?.requestId) break;
				requests.set(data.requestId, {
					url: data.url ?? '',
					resourceType: data.resourceType ?? '',
					sendTs: e.ts,
					finishTs: null,
					headerBytes: 0,
					chunkBytes: 0,
					finishBytes: 0,
					transfer: 0,
					decoded: 0,
					cached: false,
				});
				break;
			case 'ResourceReceiveResponse': {
				const req = requests.get(data?.requestId);
				if (!req) break;
				req.headerBytes = bytes(data.encodedDataLength);
				// 304와 캐시 히트는 바이트가 안 나갔다는 뜻이다. 헤더 몇백 바이트는 전송량으로 세지 않는다.
				req.cached = Boolean(data.fromCache) || data.statusCode === 304;
				break;
			}
			case 'ResourceReceivedData': {
				const req = requests.get(data?.requestId);
				if (req) req.chunkBytes += bytes(data.encodedDataLength);
				break;
			}
			case 'ResourceFinish': {
				const req = requests.get(data?.requestId);
				if (!req) break;
				req.finishTs = e.ts;
				req.decoded = data.decodedBodyLength ?? 0;
				req.finishBytes = bytes(data.encodedDataLength);
				break;
			}
			default:
				break;
		}
	}

	// ⚠ 전송량은 위 루프 안에서 못 정한다. **트레이스 이벤트는 전역 시간순이 아니다**(프로세스·스레드별로
	// 묶여 있다) — 폰트 요청은 `ResourceFinish`가 자기 `ResourceReceivedData` 32개보다 배열에서 먼저
	// 나와서, 그 자리에서 계산하면 청크 합이 0이라 2.0MB가 캐시 히트로 오판됐다. 다 모은 뒤에 정한다.
	for (const req of requests.values()) {
		if (req.chunkBytes === 0 && req.decoded > 0) req.cached = true;
		req.transfer = req.cached ? 0 : Math.max(req.finishBytes, req.headerBytes + req.chunkBytes);
	}

	// ResourceSendRequest 없이 ResourceFinish만 있는 요청이 있다(id 형식이 pid.n인 계열).
	// 조용히 버리면 합계가 새므로 개수만 따로 보고한다.
	const unmatched = { count: 0, transfer: 0 };
	for (const e of events) {
		if (e.name !== 'ResourceFinish') continue;
		const id = e.args?.data?.requestId;
		if (id && !requests.has(id)) {
			unmatched.count += 1;
			unmatched.transfer += bytes(e.args.data.encodedDataLength);
		}
	}

	const groups = new Map();
	// blob:·data:는 네트워크를 안 탄다(GLB 파싱·KTX2 트랜스코딩이 만드는 메모리 읽기다). 전송량에
	// 섞으면 실측 1.4MB가 더 부풀어 폰트·HDR 비중이 실제보다 작아 보인다.
	const local = { count: 0, bytes: 0 };
	for (const req of requests.values()) {
		if (req.finishTs === null) continue; // 녹화가 끊긴 진행 중 요청
		if (/^(blob|data):/.test(req.url)) {
			local.count += 1;
			local.bytes += req.transfer;
			continue;
		}
		const key = bucketOf(req.url, req.resourceType);
		const g =
			groups.get(key) ??
			{ bucket: key, count: 0, cached: 0, transfer: 0, decoded: 0, firstSend: Infinity, lastFinish: -Infinity, items: [] };
		g.count += 1;
		if (req.cached) g.cached += 1;
		g.transfer += req.transfer;
		g.decoded += req.decoded;
		if (t0 !== null) {
			g.firstSend = Math.min(g.firstSend, (req.sendTs - t0) / 1000);
			g.lastFinish = Math.max(g.lastFinish, (req.finishTs - t0) / 1000);
		}
		g.items.push(req);
		groups.set(key, g);
	}

	// 롱태스크는 페이지를 그리는 렌더러 메인스레드에서만 의미가 있다. RunTask는 브라우저·GPU·
	// 다른 렌더러 프로세스에도 있어서, pid를 안 좁히면 전혀 남의 작업이 섞인다.
	const mainTid = mainThreadTid(events, mainPid);
	const longTasks = [];
	for (const e of events) {
		if (e.name !== 'RunTask' || e.pid !== mainPid || e.tid !== mainTid) continue;
		const ms = (e.dur ?? 0) / 1000;
		if (ms >= longTaskMs) longTasks.push({ ms, at: t0 === null ? null : (e.ts - t0) / 1000 });
	}
	longTasks.sort((a, b) => b.ms - a.ms);

	return {
		t0,
		mainPid,
		mainTid,
		groups: [...groups.values()].sort((a, b) => b.transfer - a.transfer),
		unmatched,
		local,
		longTasks,
		longTaskMs,
	};
}

function mainThreadTid(events, pid) {
	for (const e of events) {
		if (e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain') return e.tid;
	}
	return null;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const ms = (n) => (Number.isFinite(n) ? `${n.toFixed(0)} ms` : '—');

function render(report, { top }) {
	const { groups, unmatched, local, longTasks, longTaskMs } = report;
	const total = groups.reduce((s, g) => s + g.transfer, 0);
	const out = [];

	if (report.t0 === null) out.push('⚠ navigationStart가 없다 — 구간(시작·완료)은 비어 나온다. 리로드부터 녹화할 것.');
	if (report.mainTid === null) out.push('⚠ 렌더러 메인스레드를 못 찾았다 — 롱태스크 집계가 비어 있을 수 있다.');

	out.push('== 전송 바이트 (캐시 히트 제외) ==');
	out.push('종류        건수  캐시   전송        비중   압축 전       첫 요청     마지막 완료');
	for (const g of groups) {
		const share = total ? `${((g.transfer / total) * 100).toFixed(1)}%` : '—';
		out.push(
			[
				g.bucket.padEnd(10),
				String(g.count).padStart(4),
				String(g.cached).padStart(5),
				kb(g.transfer).padStart(11),
				share.padStart(7),
				kb(g.decoded).padStart(12),
				ms(g.firstSend).padStart(11),
				ms(g.lastFinish).padStart(13),
			].join(' '),
		);
	}
	out.push(`${'합계'.padEnd(9)} ${String(groups.reduce((s, g) => s + g.count, 0)).padStart(4)}       ${kb(total).padStart(11)}`);
	if (unmatched.count) {
		out.push(`(요청 이벤트가 없어 종류를 못 가른 응답 ${unmatched.count}건 / ${kb(unmatched.transfer)} — 위 합계에 없다)`);
	}
	if (local.count) {
		out.push(`(blob:·data: ${local.count}건 / ${kb(local.bytes)} 제외 — 네트워크 전송이 아니다)`);
	}

	out.push('');
	out.push(`== 전송 상위 ${top}건 ==`);
	const items = groups
		.flatMap((g) => g.items.map((i) => ({ ...i, bucket: g.bucket })))
		.filter((i) => i.transfer > 0)
		.sort((a, b) => b.transfer - a.transfer)
		.slice(0, top);
	for (const i of items) {
		out.push(`${kb(i.transfer).padStart(11)}  ${i.bucket.padEnd(8)} ${shortUrl(i.url)}`);
	}

	out.push('');
	const sum = longTasks.reduce((s, t) => s + t.ms, 0);
	out.push(`== 메인스레드 롱태스크 (${longTaskMs}ms 이상) ==`);
	out.push(`${longTasks.length}건 · 합 ${ms(sum)} · 최대 ${ms(longTasks[0]?.ms ?? 0)}`);
	for (const t of longTasks.slice(0, top)) out.push(`${ms(t.ms).padStart(9)}  navigationStart+${ms(t.at)}`);

	return out.join('\n');
}

function shortUrl(url) {
	const bare = url.split('?')[0];
	return bare.length > 72 ? `…${bare.slice(-71)}` : bare;
}

function selftest() {
	const t0 = 1_000_000;
	const events = [
		{ name: 'navigationStart', ph: 'R', pid: 7, ts: t0, args: { data: { isOutermostMainFrame: true } } },
		{ name: 'thread_name', pid: 7, tid: 1, args: { name: 'CrRendererMain' } },
		// GLB 형식: finish가 헤더+본문 총량이다
		{ name: 'ResourceSendRequest', pid: 7, ts: t0 + 500_000, args: { data: { requestId: 'a', url: 'https://s3/x.glb' } } },
		{ name: 'ResourceReceiveResponse', pid: 7, args: { data: { requestId: 'a', statusCode: 200, encodedDataLength: 48 } } },
		{ name: 'ResourceReceivedData', pid: 7, args: { data: { requestId: 'a', encodedDataLength: 2000 } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 900_000, args: { data: { requestId: 'a', encodedDataLength: 2048, decodedBodyLength: 2000 } } },
		// HDR 형식: finish는 헤더뿐이고 본문은 청크에만 있다
		{ name: 'ResourceSendRequest', pid: 7, ts: t0 + 100_000, args: { data: { requestId: 'b', url: 'https://o/e.hdr' } } },
		{ name: 'ResourceReceiveResponse', pid: 7, args: { data: { requestId: 'b', statusCode: 200, encodedDataLength: 183 } } },
		{ name: 'ResourceReceivedData', pid: 7, args: { data: { requestId: 'b', encodedDataLength: 900 } } },
		{ name: 'ResourceReceivedData', pid: 7, args: { data: { requestId: 'b', encodedDataLength: 100 } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 150_000, args: { data: { requestId: 'b', encodedDataLength: 183, decodedBodyLength: 1000 } } },
		// 캐시 히트: 청크가 없고 본문만 있다
		{ name: 'ResourceSendRequest', pid: 7, ts: t0, args: { data: { requestId: 'c', url: 'https://o/f.woff2' } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 10_000, args: { data: { requestId: 'c', encodedDataLength: 0, decodedBodyLength: 500 } } },
		// 취소된 요청: -1이 합계를 깎으면 안 된다
		{ name: 'ResourceSendRequest', pid: 7, ts: t0, args: { data: { requestId: 'd', url: 'https://o/g.css' } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 20_000, args: { data: { requestId: 'd', encodedDataLength: -1, decodedBodyLength: 0, didFail: true } } },
		// 이벤트가 시간순이 아닌 경우: finish가 자기 청크보다 먼저 나온다(실측 폰트가 이 형태였다)
		{ name: 'ResourceSendRequest', pid: 7, ts: t0, args: { data: { requestId: 'e', url: 'https://o/late.js' } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 30_000, args: { data: { requestId: 'e', encodedDataLength: 0, decodedBodyLength: 4000 } } },
		{ name: 'ResourceReceivedData', pid: 7, args: { data: { requestId: 'e', encodedDataLength: 1500 } } },
		// blob 읽기는 네트워크가 아니다
		{ name: 'ResourceSendRequest', pid: 7, ts: t0, args: { data: { requestId: 'f', url: 'blob:https://o/abc' } } },
		{ name: 'ResourceReceivedData', pid: 7, args: { data: { requestId: 'f', encodedDataLength: 9000 } } },
		{ name: 'ResourceFinish', pid: 7, ts: t0 + 40_000, args: { data: { requestId: 'f', encodedDataLength: 9000, decodedBodyLength: 9000 } } },
		// 요청 이벤트 없는 응답
		{ name: 'ResourceFinish', pid: 7, ts: t0, args: { data: { requestId: 'zz', encodedDataLength: 77, decodedBodyLength: 70 } } },
		// 롱태스크: 메인스레드 것만 잡혀야 한다
		{ name: 'RunTask', pid: 7, tid: 1, ts: t0 + 200_000, dur: 120_000 },
		{ name: 'RunTask', pid: 7, tid: 1, ts: t0 + 400_000, dur: 10_000 },
		{ name: 'RunTask', pid: 9, tid: 1, ts: t0, dur: 300_000 },
	];

	const r = aggregate(events, { longTaskMs: 50 });
	const byBucket = Object.fromEntries(r.groups.map((g) => [g.bucket, g]));

	assert.equal(byBucket.glb.transfer, 2048, 'finish가 총량인 형식');
	assert.equal(byBucket.glb.firstSend, 500);
	assert.equal(byBucket.glb.lastFinish, 900);
	assert.equal(byBucket.hdr.transfer, 1183, 'finish가 헤더뿐인 형식 — 청크를 더해야 한다');
	assert.equal(byBucket.hdr.cached, 0);
	assert.equal(byBucket.font.transfer, 0, '청크 없이 본문만 있으면 캐시');
	assert.equal(byBucket.font.cached, 1);
	assert.equal(byBucket.css.transfer, 0, '-1은 0으로');
	assert.equal(byBucket.js.transfer, 1500, '이벤트 순서와 무관해야 한다');
	assert.equal(byBucket.js.cached, 0);
	assert.equal(r.local.count, 1, 'blob은 전송에서 빼고 따로 센다');
	assert.equal(r.local.bytes, 9000);
	assert.equal(r.unmatched.count, 1);
	assert.equal(r.unmatched.transfer, 77);
	assert.deepEqual(r.longTasks.map((t) => t.ms), [120], '남의 프로세스 RunTask는 안 센다');
	assert.equal(r.longTasks[0].at, 200);

	console.log('selftest ok');
}

function main(argv) {
	if (argv.includes('--selftest')) return selftest();

	const path = argv.find((a) => !a.startsWith('--'));
	if (!path) {
		console.error('사용법: node scripts/perf-trace-report.mjs <trace.json> [--top N] [--longtask-ms N]');
		process.exit(1);
	}
	const num = (flag, fallback) => {
		const i = argv.indexOf(flag);
		return i === -1 ? fallback : Number(argv[i + 1]);
	};

	const raw = JSON.parse(readFileSync(path, 'utf8'));
	const events = Array.isArray(raw) ? raw : raw.traceEvents;
	if (!Array.isArray(events)) {
		console.error('traceEvents 배열을 못 찾았다 — DevTools Performance가 저장한 파일인지 확인할 것.');
		process.exit(1);
	}

	console.log(render(aggregate(events, { longTaskMs: num('--longtask-ms', 50) }), { top: num('--top', 10) }));
}

main(process.argv.slice(2));
