// 벽 경계 수용 기준 (REQ-SIM-25 / D22): 켜진 벽은 드래그·배치를 하드 클램프하고,
// 꺼진 벽은 제약이 없다. 소프트 경고·저장 게이트는 2026-08-03 박동규 승인으로
// 제거됐고(머리 캔틸리버는 상판 규칙이 이미 허용하는데 벽만 전 파트를 봐서 어긋났다)
// 그것을 검증하던 test 3도 함께 지웠다.
// 좌표 근거: desk-oak-1200 상판 halfW=0.6 halfD=0.3, 전면 벽 z=-0.35(=-depth/2-50mm,
// 기본 간격 FRONT_WALL_GAP_DEFAULT_M — 2026-08-06 1mm→50mm), 좌우 벽 x=±1.55.
// 머그 90×90mm(반폭 0.045).
import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁 없이 goto하면 /login으로
// 튕겨 씬이 뜨지 않는다. Playwright에 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 프론트가
// 실제로 부르는 인증 엔드포인트만 네트워크 레벨로 막는다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

const FRONT_WALL_Z = -0.35;
const RIGHT_WALL_X = 1.55;
const MUG_HALF = 0.045;

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(150);
}

test('1. 켜진 전면 벽은 배치·이동을 벽 안쪽으로 하드 클램프한다', async ({ page }) => {
  await boot(page);
  // 전면 벽은 기본 on — 벽 한참 뒤를 찍어도 벽면에 붙어 멈춘다.
  expect(await page.evaluate(() => window.__sim.wallState().front)).toBe(true);
  expect(await page.evaluate(() => window.__sim.deskInfo().frontWallZ)).toBeCloseTo(
    FRONT_WALL_Z,
    4,
  );

  const placed = await page.evaluate(() => {
    window.__sim.placeProductAt('mug-ceramic', 0, -5);
    return window.__sim.placedItems()[0];
  });
  expect(placed.pos.z).toBeGreaterThan(FRONT_WALL_Z);
  expect(placed.pos.z).toBeCloseTo(FRONT_WALL_Z + MUG_HALF, 4);

  // 이미 놓인 아이템의 이동도 같은 클램프를 탄다 (드래그 경로).
  const moved = await page.evaluate(() => {
    const it = window.__sim.placedItems()[0];
    window.__sim.moveItem(it.id, 0, -5);
    return window.__sim.placedItems()[0];
  });
  expect(moved.pos.z).toBeCloseTo(FRONT_WALL_Z + MUG_HALF, 4);
});

test('2. 꺼진 벽은 제약이 없고, 켜면 그때부터 클램프한다', async ({ page }) => {
  await boot(page);
  // 오른쪽 벽은 기본 off — 벽 자리를 넘어 얼마든지 나갈 수 있다.
  expect(await page.evaluate(() => window.__sim.wallState().right)).toBe(false);
  const free = await page.evaluate(() => {
    window.__sim.placeProductAt('mug-ceramic', 2, 0);
    return window.__sim.placedItems()[0];
  });
  expect(free.pos.x).toBeCloseTo(2, 6);

  // 벽을 켜고 다시 같은 좌표로 밀면 벽면에 붙어 멈춘다.
  const clamped = await page.evaluate(() => {
    window.__sim.setWall('right', true);
    const it = window.__sim.placedItems()[0];
    window.__sim.moveItem(it.id, 2, 0);
    return window.__sim.placedItems()[0];
  });
  expect(clamped.pos.x).toBeCloseTo(RIGHT_WALL_X - MUG_HALF, 4);
});

test('3. 벽간 거리보다 넓은 책상으로 바꾸면 벽이 최소 거리로 밀려난다', async ({ page }) => {
  await boot(page);
  // 벽을 최소로 좁힌다 — desk-oak-1200 halfW 0.6 + 여백 0.05 = 0.65로 클램프된다.
  const narrowed = await page.evaluate(() => {
    window.__sim.setWallDistance('left', 0.01);
    window.__sim.setWallDistance('right', 0.01);
    return window.__sim.wallDistance();
  });
  expect(narrowed.left).toBeCloseTo(0.65, 4);
  expect(narrowed.right).toBeCloseTo(0.65, 4);

  // 3000mm 책상으로 교체 — setDesk가 같은 최소 거리 클램프를 태워 벽을 밀어내야 한다.
  const widened = await page.evaluate(() => {
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 3000,
      depthMm: 700,
      heightMm: 740,
      topThicknessMm: 25,
      materialId: 'oak',
      frameType: 'four-leg',
    });
    return window.__sim.wallDistance();
  });
  expect(widened.left).toBeCloseTo(1.55, 4); // 반폭 1.5 + 여백 0.05
  expect(widened.right).toBeCloseTo(1.55, 4);
});
