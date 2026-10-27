import { test, expect, type Page } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// 벽면별 마감(ADR-0030, DERO-508) — **배선 스모크만** 본다.
// 계약(계열·변형 폴백, 이관 매핑, 저장 형식 변환, 프리셋 프리필)은 vitest가 지고
// (`tests/roomFinish.test.ts`), 여기서는 브라우저·픽셀만 답할 수 있는 두 가지를 본다:
// ① 면마다 다른 마감이 실제로 **면마다 다르게 그려지는가**, ② 저장 → 재로드에서
// 세 면·바닥이 살아 돌아오는가. 픽셀은 절대값이 아니라 **관계**로만 판정한다.

test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

// hero 프리셋이 보는 벽이 좌·전면 두 면이다(`src/three/CLAUDE.md`) — 그래서 이 두 밴드가
// 서로 다른 면을 본다. 상단 밴드라 걸레받이·책상에 가리지 않는다.
const LEFT_BAND = { fx0: 0.04, fy0: 0.1, fx1: 0.16, fy1: 0.26 };
const FRONT_BAND = { fx0: 0.45, fy0: 0.1, fx1: 0.62, fy1: 0.26 };

type RGB = { r: number; g: number; b: number };
const sum = (c: RGB): number => c.r + c.g + c.b;
/** 청색 우위(b−r) — 창밖 판정은 밝기가 아니라 **색축**으로 한다. 주간 창밖은 하늘·대기
 *  원근 도시색 전부 b>r로 설계돼 있고(`windowNodes.ts` DAY_* 색상), neutral 벽은 무채(b≈r,
 *  실측 |Δ|<1)다. 2026-08-09 판정값 적용에서 밝기 합·L1 거리 판정이 둘 다 깨졌다 — 옅어진
 *  하늘이 벽과 같은 밝기가 됐기 때문(실측: 합 598 vs 624, L1 41 < 옛 문턱 90). b−r은
 *  개구부 +30.6 vs 벽 +0.8로 여유 2배(문턱 15). */
const blueness = (c: RGB): number => c.b - c.r;

const sample = (page: Page, band: typeof LEFT_BAND): Promise<RGB> =>
  page.evaluate((b) => window.__sim.sampleRegion(b.fx0, b.fy0, b.fx1, b.fy1), band);

async function enterEmptySim(page: Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.__sim.enterSim('desk-oak-1200');
    window.__sim.reset(); // 데모 아이템이 벽을 가리지 않게
    window.__sim.setCameraPreset('hero');
    window.__sim.applyRoomPreset('neutral');
  });
  await page.waitForTimeout(400);
}

test('per-wall finishes really render per face', async ({ page }) => {
  // 마감을 바꾸면 그 면의 NodeMaterial 셰이더가 새로 컴파일된다 — SwiftShader에서 이 한 번이
  // 수십 초다(실측 1.0m로 기본 60s 예산에 턱걸이했다가 그 다음 실행에서 타임아웃).
  test.slow();
  await enterEmptySim(page);

  // 세 면이 같은 마감이면 두 밴드가 같은 톤이다(같은 페인트, 조명 차이만).
  const baseLeft = await sample(page, LEFT_BAND);
  const baseFront = await sample(page, FRONT_BAND);

  // 좌측 **한 면만** 차콜로 바꾼다 — 전면은 그대로여야 한다.
  await page.evaluate(() =>
    window.__sim.setWallFinish('left', { material: 'PAINT', variant: 'CHARCOAL' }),
  );
  await page.waitForTimeout(400);
  const darkLeft = await sample(page, LEFT_BAND);
  const keptFront = await sample(page, FRONT_BAND);

  console.log(
    `[room-finish] left ${sum(baseLeft).toFixed(1)} -> ${sum(darkLeft).toFixed(1)} | ` +
      `front ${sum(baseFront).toFixed(1)} -> ${sum(keptFront).toFixed(1)}`,
  );

  // 바꾼 면은 눈에 띄게 어두워지고…
  expect(sum(darkLeft)).toBeLessThan(sum(baseLeft) * 0.7);
  // …안 바꾼 면은 사실상 그대로다(간접광 차이만큼의 여유).
  expect(sum(keptFront)).toBeGreaterThan(sum(baseFront) * 0.85);
  // 그 결과 두 면이 서로 다르게 그려진다 — 이 축의 전부다.
  expect(sum(keptFront)).toBeGreaterThan(sum(darkLeft) * 1.4);
});

// 시간대(DERO-510) — 픽셀 절대값이 아니라 **관계**만 본다. 야간이 얼마나 어두워야
// 하는지는 사람이 판정한다(계열 5종 × 시간대 2 스크린샷은 박동규 몫).
test('night is dimmer than day and never pitch black', async ({ page }) => {
  test.slow();
  await enterEmptySim(page);

  const day = await sample(page, FRONT_BAND);

  await page.evaluate(() => window.__sim.setTimeOfDay('NIGHT'));
  await page.waitForTimeout(400);
  const night = await sample(page, FRONT_BAND);

  // 야간은 방 조명이 기본값으로 꺼진다 — 그 조합이 이 서비스의 "밤"이다.
  expect(await page.evaluate(() => window.__sim.roomLightOn())).toBe(false);

  console.log(`[room-finish] day ${sum(day).toFixed(1)} -> night ${sum(night).toFixed(1)}`);
  expect(sum(night)).toBeLessThan(sum(day) * 0.8);
  // 칠흑이 아니다 — 실루엣이 읽혀야 배치를 검토할 수 있다(사용자 스토리 18).
  expect(sum(night)).toBeGreaterThan(0);

  // 밤에 천장등을 켜면 다시 밝아진다 = 두 축이 병합되지 않았다는 증거.
  await page.evaluate(() => window.__sim.setRoomLight(true));
  await page.waitForTimeout(400);
  const nightLit = await sample(page, FRONT_BAND);
  expect(sum(nightLit)).toBeGreaterThan(sum(night));
  expect(sum(nightLit)).toBeLessThan(sum(day));
});

// 창밖 풍경 스모크(DERO-512) — 룩은 사람이 판정한다(주·야 스크린샷은 박동규 몫).
// 기계가 답할 수 있는 것은 **개구부 너머가 실제로 그려지는가** 하나다: 창문을 내기 전에는
// 그 자리가 벽이고, 낸 뒤에는 같은 자리가 벽과 다른 그림이어야 한다.
test('the opening shows scenery, not the wall', async ({ page }) => {
  test.slow();
  await enterEmptySim(page);
  await page.evaluate(() => window.__sim.setCameraPreset('front'));
  await page.waitForTimeout(400);

  // front 프리셋(fov 38, (0,1.2,2.7)→(0,0.9,0), 전면 벽 z=-0.35)에서 전면 벽의 가시 폭은
  // 뷰포트 1600×1000 기준 약 3.36m다 — fx 0.5가 x=0, fx 0.85가 x≈+1.18m. 와이드 창
  // (±0.9m)의 안과 밖을 **같은 높이에서** 한 쌍으로 잡는다(조명 세로 그라디언트를 상쇄한다).
  const IN_WINDOW = { fx0: 0.45, fy0: 0.26, fx1: 0.55, fy1: 0.36 };
  const OFF_WINDOW = { fx0: 0.8, fy0: 0.26, fx1: 0.9, fy1: 0.36 };

  const wallBefore = await sample(page, IN_WINDOW);

  await page.evaluate(() => {
    window.__sim.setWallWindow('front', {
      centerXMm: 0,
      centerYMm: 1600,
      widthMm: 1800,
      heightMm: 1400,
    });
  });
  await page.waitForTimeout(600);
  const inWindow = await sample(page, IN_WINDOW);
  const offWindow = await sample(page, OFF_WINDOW);

  console.log(
    `[window-view] wall ${sum(wallBefore).toFixed(1)} -> opening ${sum(inWindow).toFixed(1)} | ` +
      `wall beside it ${sum(offWindow).toFixed(1)}`,
  );

  // 같은 자리가 창문을 내기 전후로 청색 우위로 돌아선다 = 구멍 너머에 하늘/도시가 그려졌다.
  expect(blueness(inWindow) - blueness(wallBefore)).toBeGreaterThan(15);
  // 그리고 옆의 무채 벽과도 색축이 갈린다 = 벽 재질이 비쳐 보이는 것이 아니다.
  expect(blueness(inWindow) - blueness(offWindow)).toBeGreaterThan(15);
  // 새까만 구멍이 아니다(창밖이 노출 보정 없이 렌더되면 그렇게 보인다).
  expect(sum(inWindow)).toBeGreaterThan(0);
});

// 마감 × 창문 (2026-08-10) — **마감은 개구부를 덮을 권한이 없다.** 우드 슬랫이 창문을 통째로
// 가리던 것이 이 테스트가 생긴 이유다(실측 개구부 b−r 30.7 → −12.6, 밝기합 624 → 415).
// 판정은 반드시 **"마감을 바꿔도 개구부 픽셀이 안 변한다"**여야 한다 — "개구부가 옆 벽보다
// 파란가"로 짜면 슬랫 틈으로 새는 하늘이 갈색 벽보다는 여전히 파래서 통과한다(1차 실패).
test('no wall finish may cover the window opening', async ({ page }) => {
  test.setTimeout(300_000); // 계열 5종 = NodeMaterial 컴파일 5회, SwiftShader에서 각각 수십 초

  const IN_WINDOW = { fx0: 0.45, fy0: 0.26, fx1: 0.55, fy1: 0.36 };
  const FINISHES = [
    { material: 'PAINT', variant: 'WHITE' },
    { material: 'CONCRETE', variant: 'LIGHT' },
    { material: 'BRICK', variant: 'RED' },
    { material: 'MARBLE', variant: 'WHITE' },
    { material: 'WOOD_SLAT', variant: 'OAK' },
  ] as const;

  await enterEmptySim(page);
  await page.evaluate(() => {
    window.__sim.setCameraPreset('front');
    window.__sim.setWallWindow('front', {
      centerXMm: 0,
      centerYMm: 1600,
      widthMm: 1800,
      heightMm: 1400,
    });
  });
  await page.waitForTimeout(1500);

  const baseline = await sample(page, IN_WINDOW);
  const drift: { label: string; dBlue: number }[] = [];
  for (const finish of FINISHES) {
    await page.evaluate((f) => window.__sim.setWallFinish('front', f), finish);
    await page.waitForTimeout(1500);
    const inWindow = await sample(page, IN_WINDOW);
    drift.push({
      label: `${finish.material}/${finish.variant}`,
      dBlue: blueness(inWindow) - blueness(baseline),
    });
  }

  console.log(
    `[room-finish] opening drift ${drift.map((d) => `${d.label} ${d.dBlue.toFixed(1)}`).join(' | ')}`,
  );

  for (const d of drift) {
    // 문턱 5는 재로드 없는 한 페이지 안의 노이즈 바닥(실측 0.0~0.1)보다 두 자릿수 위다.
    expect(Math.abs(d.dBlue), `${d.label} changed the opening`).toBeLessThan(5);
  }
});

// 창문 자리 벽걸이 회피 스모크(DERO-511) — 계약 상세(경계·슬롯·크기 조합)는
// `tests/wallWindow.test.ts`의 실제 Raycaster가 지고, 여기서는 **씬이 창문을 실제로 물고
// 있는가**(구멍 뚫린 지오메트리가 드래그 경로의 레이캐스트에 걸리는가)만 본다.
// 이 파일의 유일한 실드래그다 — 스펙 파일당 1건(e2e/CLAUDE.md).
test('a wall item cannot be dropped into the window opening (real drag)', async ({ page }) => {
  test.slow(); // 실드래그(10 pointermove × 고스트)는 SwiftShader에서 단독으로도 55s급
  await enterEmptySim(page);
  await page.evaluate(() => {
    // 와이드 창(1800×1400, 중앙, 창턱 900) — 전면 시점에서 화면 상단 중앙이 확실히
    // 구멍 안이 되게 가장 큰 창을 쓴다.
    window.__sim.setWallWindow('front', {
      centerXMm: 0,
      centerYMm: 1600,
      widthMm: 1800,
      heightMm: 1400,
    });
    window.__sim.setCameraPreset('front');
  });
  await page.waitForTimeout(300);

  await page.getByTestId('rail-product').click();
  await page.getByTestId('category-decor').click();
  const card = page.getByTestId('lib-card-pegboard-600');
  const canvas = page.getByTestId('sim-canvas');
  await card.hover();
  const cardBox = (await card.boundingBox())!;
  const cBox = (await canvas.boundingBox())!;
  const sx = cardBox.x + cardBox.width / 2;
  const sy = cardBox.y + cardBox.height / 2;
  // front 프리셋(fov 38, (0,1.2,2.7)→(0,0.9,0))에서 화면 세로 30% 지점은 전면 벽
  // 월드 y≈1.27 — 창문 사각형(0.9~2.3) 안이고 가로 중앙은 x=0이다.
  const tx = cBox.x + cBox.width / 2;
  const ty = cBox.y + cBox.height * 0.3;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 10, sy + ((ty - sy) * i) / 10);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  // 구멍은 레이캐스트가 통과하므로 창문 안을 노린 드롭은 벽 히트가 없다 — 엔진이 기본
  // 부착(켜진 벽, 상판 높이)으로 물러서고, 그 좌표가 창문 안이면 wallPoseAt이 창문 밖으로
  // 민다. 어느 쪽이든 **아이템 중심이 창문 사각형 안에 붙는 일은 없어야 한다.**
  const items = await page.evaluate(() => window.__sim.placedItems());
  expect(items).toHaveLength(1);
  const centerYM = items[0].pos.y + 0.3; // pos는 바닥면 중심, pegboard-600 높이 600mm
  const inWindow =
    Math.abs(items[0].pos.x) < 0.9 && centerYM > 0.9 && centerYM < 2.3 && items[0].pos.z < 0;
  console.log(
    `[room-finish] dropped at x=${items[0].pos.x.toFixed(3)} y=${centerYM.toFixed(3)} z=${items[0].pos.z.toFixed(3)}`,
  );
  expect(inWindow).toBe(false);
});

test('three walls, the floor and the time of day survive save and reload', async ({ page }) => {
  test.slow(); // 씬 진입이 두 번(저장 전·재로드 후)이라 기본 60s 예산으로는 못 끝난다

  // 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 저장 요청 본문을 가로채 그대로 상세 응답으로
  // 되돌려 준다 — 이 왕복이 검증하는 것은 프론트의 저장·복원 배선이다.
  const PLACEMENT_ID = 5081;
  let saved: {
    walls?: {
      wallSide: string;
      isOn: boolean;
      material: string;
      variant: string;
      hasWindow?: boolean;
      windowCenterXMm?: number;
      windowCenterYMm?: number;
      windowWidthMm?: number;
      windowHeightMm?: number;
    }[];
    floor?: { material: string; variant: string };
    timeOfDay?: string;
  } | null = null;

  await page.route('**/api/v1/placements', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: PLACEMENT_ID,
        updatedAt: '2026-08-08T00:00:00Z',
        version: 1,
        items: [],
        violations: [],
      }),
    });
  });

  await page.route(`**/api/v1/placements/${PLACEMENT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: PLACEMENT_ID,
        title: '벽면 마감 왕복',
        budgetKrw: 0,
        version: 1,
        publishStatus: 'PRIVATE',
        isRoomLightOn: true,
        walls: saved?.walls ?? [],
        floor: saved?.floor,
        timeOfDay: saved?.timeOfDay,
        desk: {
          specSource: 'CUSTOM',
          widthMm: 1200,
          depthMm: 600,
          heightMm: 720,
          topThicknessMm: 25,
          edgeThicknessMm: 25,
          frameType: 'FOUR_LEG',
        },
        items: [],
      }),
    });
  });

  await enterEmptySim(page);
  // 세 면을 서로 다르게, 바닥도 따로 — 프리셋 하나로는 만들 수 없는 조합이라야 왕복이
  // 프리셋 키가 아니라 벽면 값을 실어 나른다는 것이 증명된다.
  await page.evaluate(() => {
    window.__sim.setWallFinish('left', { material: 'WOOD_SLAT', variant: 'WALNUT' });
    window.__sim.setWallFinish('front', { material: 'PAINT', variant: 'CHARCOAL' });
    window.__sim.setWallFinish('right', { material: 'PAINT', variant: 'WHITE' });
    window.__sim.setFloorFinish({ material: 'WOOD', variant: 'LIGHT_OAK' });
    window.__sim.setWall('right', true);
    window.__sim.setTimeOfDay('NIGHT'); // 기본값과 다른 값이라야 왕복이 증명된다
    // 창문도 왕복 대상이다(DERO-511) — 저장은 mm 4값 + hasWindow.
    window.__sim.setWallWindow('front', {
      centerXMm: 600,
      centerYMm: 1600,
      widthMm: 1800,
      heightMm: 1400,
    });
  });

  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(true);
  await expect.poll(() => saved !== null, { timeout: 15_000 }).toBe(true);
  expect(saved!.walls).toHaveLength(3);
  expect(saved!.floor).toEqual({ material: 'WOOD', variant: 'LIGHT_OAK' });
  expect(saved!.timeOfDay).toBe('NIGHT');
  const savedFront = saved!.walls!.find((w) => w.wallSide === 'FRONT')!;
  expect(savedFront.hasWindow).toBe(true);
  expect(savedFront.windowWidthMm).toBe(1800);
  expect(saved!.walls!.find((w) => w.wallSide === 'LEFT')!.hasWindow).toBe(false);

  await page.goto(`/simulator?deskProjectId=${PLACEMENT_ID}`);
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  // 스펙 3개를 이어 돌리면 SwiftShader 세션이 누적돼 두 번째 진입의 `loadPlacement`가
  // 30초를 넘긴다(e2e/CLAUDE.md의 연속 실행 저하) — 판정이 아니라 예산 문제라 늘려 둔다.
  await expect
    .poll(() => page.evaluate(() => window.__sim.roomConfig().walls.front.variant), {
      timeout: 60_000,
    })
    .toBe('CHARCOAL');

  const restored = await page.evaluate(() => window.__sim.roomConfig());
  expect(restored.walls.left).toEqual({ material: 'WOOD_SLAT', variant: 'WALNUT' });
  expect(restored.walls.right).toEqual({ material: 'PAINT', variant: 'WHITE' });
  expect(restored.floor).toEqual({ material: 'WOOD', variant: 'LIGHT_OAK' });
  expect(restored.timeOfDay).toBe('NIGHT');
  expect(restored.walls.front.window).toEqual({
    centerXMm: 600,
    centerYMm: 1600,
    widthMm: 1800,
    heightMm: 1400,
  });
  // 벽 표시 여부의 정본도 walls[]다 — 옛 boolean 3컬럼이 전부 false여도 우측 벽이 켜져 있다.
  expect(await page.evaluate(() => window.__sim.wallState())).toEqual({
    left: true,
    front: true,
    right: true,
  });
});
