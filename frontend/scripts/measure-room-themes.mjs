// 재질 계열 5종 성능 계측 + 스크린샷 — ADR-0021 성능 DoD("전환 스톨·계열별 drawcall/삼각형을
// 측정해 기록, WebGL2 폴백에서 전부 렌더 확인")의 계측기. 2026-08-09(DERO-509)에 계측
// 단위를 방 프리셋 4종에서 **재질 계열**로 바꿨다 — 프리셋은 저장되지 않는 프리필 버튼이고
// 룩과 비용을 소유하는 것은 계열이다(ADR-0030 결정 1·2).
//
// e2e 스펙이 아니다 — 통과/실패를 가르는 게 아니라 숫자를 뽑는 도구다. 실행 전 `next build &&
// next start`로 서버를 띄워야 한다(`next dev`에 붙이면 개발 오버레이 배지가 스크린샷에 찍히고,
// 리포에 파일이 쓰이면 HMR이 시작 화면으로 되돌린다 — e2e/CLAUDE.md).
//
// **`NEXT_PUBLIC_API_MODE=mock`은 `next build`에 붙인다** — `NEXT_PUBLIC_*`은 빌드 시점에 번들로
// 인라인되므로 `next start`에만 붙이면 효과가 없고, 앱이 실 백엔드(`localhost:8080`)를 때려
// 카탈로그 fetch가 죽는다. 그 실패는 `window.__sim`이 아예 안 생기는 형태로 나타나 이 스크립트가
// 98행 `waitForFunction` 60초 타임아웃으로만 죽는다 — 원인이 로그에 안 보인다(2026-08-04).
//
//   NEXT_PUBLIC_API_MODE=mock NODE_OPTIONS=--max-old-space-size=4096 npx next build
//   NEXT_PUBLIC_API_MODE=mock npx next start -p 3100
//   node scripts/measure-room-themes.mjs --base http://localhost:3100 --out /tmp/theme-shots
//
// 스톨 정의: 계열 한 벌을 써넣는 setter 4회(벽 3면 + 바닥) 직전부터 그 다음 프레임 렌더가
// 끝날 때까지(rAF 2회). **방 재빌드 4회분이라 사용자 클릭 1회 비용의 상한이다**(applyAndTime
// 주석 참조). 마감은 캐시하지 않으므로(ADR-0021 결정 6) 전환마다 이전 재질을 dispose한다 — 2회차
// 전환도 셰이더를 다시 만든다. 드라이버 프로그램 캐시가 얼마나 먹는지가 1회차/2회차 차이다.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3100');
const OUT = arg('out', '/tmp/theme-shots');
// 계측 단위는 **재질 계열**이다(DERO-509) — 프리셋은 계열 값을 써넣는 프리필 버튼이라
// (ADR-0030 결정 1) 계열별 숫자가 프리셋별 숫자를 포함한다. 벽 3면을 같은 계열로 덮어야
// 그 계열 하나의 비용이 보인다. 바닥 계열은 벽과 독립이라 같은 줄에 태워 함께 바꾼다.
const SCENES = [
  { key: 'PAINT/NEUTRAL', wall: ['PAINT', 'NEUTRAL'], floor: ['WOOD', 'OAK'] },
  { key: 'WOOD_SLAT/OAK', wall: ['WOOD_SLAT', 'OAK'], floor: ['WOOD', 'LIGHT_OAK'] },
  { key: 'BRICK/RED', wall: ['BRICK', 'RED'], floor: ['TILE', 'WHITE'] },
  { key: 'MARBLE/WHITE', wall: ['MARBLE', 'WHITE'], floor: ['TILE', 'GRAY'] },
  { key: 'CONCRETE/LIGHT', wall: ['CONCRETE', 'LIGHT'], floor: ['CARPET', 'GRAY'] },
];

// WebGPU가 없는 헤드리스에서 WebGL2 폴백을 돌리기 위한 소프트웨어 래스터라이저 —
// e2e/playwright.config.ts와 같은 조합이어야 한다.
const SWIFTSHADER_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];

const VIEWPORT = { width: 1600, height: 1000 };
const DEVICE_SCALE_FACTOR = 1; // 이 씬은 픽셀 바운드다 — dpr 없는 프레임 수치는 무의미(283)

// SwiftShader는 CPU 래스터라이저라 프레임 하나가 초 단위다 — 스톨 수치를 실기와 비교하면
// 안 된다(e2e/CLAUDE.md). `--gpu`는 실제 GPU 백엔드(채널 chromium, 새 헤드리스)로 띄워
// ADR-0021의 "첫 전환 300ms" 판단에 쓸 수 있는 수치를 뽑는다. 인자 없이 돌리면 SwiftShader
// 조합이고, 그 실행은 대신 **WebGL2 폴백에서 4종이 렌더된다**는 것을 검증한다.
const USE_GPU = process.argv.includes('--gpu');
// `--cold`: GPU 드라이버의 셰이더 디스크 캐시를 끈다. 캐시가 살아 있으면 두 번째 실행부터
// "첫 전환"이 사실상 warm이라 ADR-0021의 프리워밍 판단(300ms)을 못 내린다.
const COLD_CACHE = process.argv.includes('--cold');
const NO_CACHE_ARGS = ['--disable-gpu-shader-disk-cache', '--disable-gpu-program-cache'];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(USE_GPU ? { channel: 'chromium' } : {}),
    args: [...(USE_GPU ? [] : SWIFTSHADER_ARGS), ...(COLD_CACHE ? NO_CACHE_ARGS : [])],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // /simulator는 AuthGate 뒤다 — 백엔드를 붙이지 않으므로 인증 두 엔드포인트만 흉내낸다.
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'qa-access-token', expiresInSeconds: 1800 }),
    }),
  );
  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: 'qa.user@dero.invalid',
        nickname: 'QA 사용자',
        profileImageUrl: null,
        provider: 'GOOGLE',
        role: 'USER',
      }),
    }),
  );
  // 첫 입장 코치마크가 뷰포트를 덮으면 스크린샷이 오버레이 사진이 된다.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'dero-simulator-tour',
      JSON.stringify({ state: { seen: true }, version: 1 }),
    );
  });

  await page.goto(`${BASE}/simulator`);
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 60_000 });
  // 4종 모두 같은 배치·같은 카메라여야 비교가 성립한다 — 기본 히어로 배치를 그대로 쓴다.
  await page.evaluate(() => {
    window.__sim.enterSim('desk-oak-1200');
    window.__sim.setCameraPreset('hero');
  });
  await page.waitForTimeout(2500);

  const applyAndTime = (scene) =>
    page.evaluate(
      (s) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          // 벽 3면 + 바닥이 한 번에 바뀌어야 이 계열 한 벌의 비용이다.
          // **여기서 재는 것은 표면 4개를 새로 짓는 비용이다** — `applyRoom`이 마감이 바뀐
          // 표면만 다시 지으므로(2026-08-09 면 단위 diff) setter 4회가 정확히 방 한 벌이다.
          // 사용자 클릭 1회는 표면 하나라 이 값의 1/4쯤이고, 이 값은 그 상한이다.
          // ADR-0021의 300ms 게이트를 상한으로도 통과하면 그 판단은 더 강하게 성립한다.
          for (const side of ['left', 'front', 'right']) {
            window.__sim.setWallFinish(side, { material: s.wall[0], variant: s.wall[1] });
          }
          window.__sim.setFloorFinish({ material: s.floor[0], variant: s.floor[1] });
          // rAF 2회 = 교체가 반영된 프레임의 렌더가 끝난 시점(R3F 루프도 rAF 위에 있다).
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
        }),
      scene,
    );

  // **적용 결과를 다시 읽는다.** 계열·변형 키는 여기 하드코딩돼 있고 `resolveWallFinish`는
  // 미상 키에 에러를 안 던지므로(ADR-0030 결정 3), 키를 개명하면 이 스크립트는 조용히
  // PAINT를 재고 exit 0으로 끝난다. 실제로 선 재질 이름(`계열/변형`)이 요청과 다르면
  // 숫자를 못 믿는다 — 시끄럽게 죽는다.
  const assertApplied = async (scene) => {
    const names = await page.evaluate(() => window.__sim.roomSurfaceNames());
    const wall = scene.wall.join('/');
    const floor = scene.floor.join('/');
    const wrong = [
      ...['left', 'front', 'right']
        .filter((s) => names.walls[s] !== wall)
        .map((s) => `${s}: ${names.walls[s]} (기대 ${wall})`),
      ...(names.floor === floor ? [] : [`floor: ${names.floor} (기대 ${floor})`]),
    ];
    if (wrong.length) {
      throw new Error(
        `[${scene.key}] 요청한 마감이 안 섰다 — 키가 죽었을 수 있다:\n  ${wrong.join('\n  ')}`,
      );
    }
  };

  const stats = () =>
    page.evaluate(() => ({
      ...window.__sim.renderStats(),
      programs: window.__sim.lightingInfo().shaderProgramCount,
    }));

  // 유휴 프레임 기준선 — 스톨 측정은 rAF 2회 간격이므로 "아무것도 안 해도 드는 시간"을
  // 빼야 전환 비용이 보인다. SwiftShader에서는 이 값 자체가 초 단위로 나온다.
  const idleSamples = [];
  for (let i = 0; i < 7; i++) {
    idleSamples.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const t0 = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(performance.now() - t0)),
            );
          }),
      ),
    );
  }
  idleSamples.sort((a, b) => a - b);
  const idleMedianMs = idleSamples[3];

  const rows = [];
  // 1회차 — 셰이더 컴파일 포함. PAINT는 부팅 때 이미 컴파일됐으므로 그 사실을 같이 적는다.
  for (const scene of SCENES) {
    const first = await applyAndTime(scene);
    await page.waitForTimeout(600);
    await assertApplied(scene);
    const s = await stats();
    rows.push({ key: scene.key, firstMs: first, ...s });
  }
  // 2회차 — 같은 순서로 한 바퀴 더. 캐시가 없으므로 순수 재생성 비용이다.
  for (const scene of SCENES) {
    // 반드시 다른 계열을 거친다 — 같은 계열을 두 번 쓰면 dispose·재생성이 안 일어난다.
    await applyAndTime(SCENES[scene === SCENES[0] ? SCENES.length - 1 : 0]);
    await page.waitForTimeout(400);
    rows.find((r) => r.key === scene.key).secondMs = await applyAndTime(scene);
    await page.waitForTimeout(400);
  }

  // 시간대 토글 스톨(DERO-510) — 마감 전환과 달리 **재질을 다시 짓지 않아야** 한다
  // (광원 세기·환경 스케일 유니폼만 움직인다, ADR-0030 결정 7). 그래서 이 수치는 유휴
  // 프레임(idleMedianMs)과 같은 수준이어야 하고, 계열 전환 수치와 비교되면 안 된다.
  const toggleTime = (time) =>
    page.evaluate(
      (t) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          window.__sim.setTimeOfDay(t);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
        }),
      time,
    );
  const timeOfDayMs = [];
  for (let i = 0; i < 6; i++) {
    timeOfDayMs.push(await toggleTime(i % 2 === 0 ? 'NIGHT' : 'DAY'));
    await page.waitForTimeout(300);
  }
  const programsAfterToggles = (await stats()).programs;

  // 창문 드레싱의 프레임 비용(DERO-520, ADR-0031) — 창문 하나가 붙으면 포털 셰이더
  // 평면 한 장 + 개구부 마감 5메쉬 + 블라인드 2드로우콜(헤드레일 + 슬랫 InstancedMesh)이
  // 는다. **창문 없음 ↔ 와이드 창의 유휴 프레임 시간 차이**가 그 비용이고, 애니메이션은
  // 유니폼 하나라 여기에 셰이더 재컴파일이 섞이면 안 된다
  // (`programsAfterWindow`가 위 값과 같아야 한다).
  const idleFrameMs = async (samples = 9) => {
    const out = [];
    for (let i = 0; i < samples; i++) {
      out.push(
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              const t0 = performance.now();
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve(performance.now() - t0)),
              );
            }),
        ),
      );
    }
    out.sort((a, b) => a - b);
    return out[Math.floor(samples / 2)];
  };
  const setWindow = (win) =>
    page.evaluate((w) => window.__sim.setWallWindow('front', w), win).then(async () => {
      await page.waitForTimeout(600);
    });

  await page.evaluate(() => window.__sim.setCameraPreset('front'));
  await page.waitForTimeout(600);
  await setWindow(null);
  const windowOffMs = await idleFrameMs();
  await setWindow({ centerXMm: 0, centerYMm: 1600, widthMm: 1800, heightMm: 1400 });
  const windowOnMs = await idleFrameMs();
  const programsAfterWindow = (await stats()).programs;
  // 창밖 주·야 스크린샷 — **박동규 시각 판정 입력이다**(창밖 포털 + 블라인드 + 바닥 웅덩이).
  for (const time of ['DAY', 'NIGHT']) {
    await toggleTime(time);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `window-view-${time}.png`), timeout: 120_000 });
  }
  await toggleTime('DAY');
  await setWindow(null);
  await page.evaluate(() => window.__sim.setCameraPreset('hero'));
  await page.waitForTimeout(600);

  // 스크린샷 — 같은 카메라 프리셋·같은 배치로 계열마다 주간·야간 두 장.
  // **박동규 시각 판정 입력이다**(계열 5종 × 시간대 2).
  for (const scene of SCENES) {
    await applyAndTime(scene);
    for (const time of ['DAY', 'NIGHT']) {
      await toggleTime(time);
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: join(OUT, `finish-${scene.key.replace('/', '-')}-${time}.png`),
        timeout: 120_000,
      });
    }
  }
  await toggleTime('DAY');

  console.log(
    JSON.stringify(
      {
        base: BASE,
        gpuMode: USE_GPU,
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        backend: await page.evaluate(() => window.__sim.backend),
        idleMedianMs,
        timeOfDayMs,
        programsAfterToggles,
        // 창문 드레싱 비용(ADR-0031) — off↔on 유휴 프레임 차이가 그 비용이고,
        // `programsAfterWindow === programsAfterToggles`가 "재빌드 없음"의 증거다.
        windowOffMs,
        windowOnMs,
        programsAfterWindow,
        rows,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
