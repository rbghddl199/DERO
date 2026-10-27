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

// DoD1 gate: real drag from the library onto the desktop, then overlap warning.
test('drag-places a product on the surface and warns on overlap', async ({ page }) => {
  // 실드래그(10 pointermove × 고스트 프리뷰)는 SwiftShader에서 단독으로도 55s 급이라
  // 기본 60s 예산으로는 부팅·hover까지 더해 넘긴다 — 실측 102s (2026-08-04, e2e/CLAUDE.md의
  // "스펙당 실드래그 1개" 항목과 같은 원인).
  test.slow();
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => window.__sim.placedCount());

  // 좌측 레일의 '제품' 카테고리를 열어야 플라이아웃이 DOM에 뜬다(EditorSidebar.tsx, 2026-07-27).
  await page.getByTestId('rail-product').click();
  // 카테고리는 세로 목록이고 클릭하면 그리드 대신 갤러리로 들어간다(2026-08-04 재개정) —
  // 키보드는 '키보드 · 마우스' 타일 소속이다(2026-08-05 카테고리 10종 개편).
  await page.getByTestId('category-keyboard-mouse').click();
  const card = page.getByTestId('lib-card-keyboard-tkl');
  const canvas = page.getByTestId('sim-canvas');
  // 갤러리 확장 애니메이션 중엔 카드가 overflow-x:hidden으로 잘려 히트테스트가 안 된다 —
  // boundingBox()는 잘리기 전 레이아웃 박스를 돌려주므로 못 믿는다. hover()의 actionability
  // 대기로 카드가 실제 포인터를 받을 때까지 기다린다.
  await card.hover();
  const cardBox = (await card.boundingBox())!;
  const cBox = (await canvas.boundingBox())!;
  const sx = cardBox.x + cardBox.width / 2;
  const sy = cardBox.y + cardBox.height / 2;
  const tx = cBox.x + cBox.width / 2;
  const ty = cBox.y + cBox.height * 0.62;

  // REAL pointer path: move -> down -> stepped move -> up
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 10, sy + ((ty - sy) * i) / 10);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => window.__sim.placedCount());
  expect(after).toBe(before + 1);

  // overlap: two items at the same default slot **and the same height** must collide + warn.
  // 두 번째 컵을 상판 높이로 내리는 것이 핵심이다 — 그냥 두 번 떨어뜨리면 ADR-0023 결정 1대로
  // 아래 컵 규격 박스 상단에 얹혀(게이트 없음) 관입이 아니라 정상 스태킹이 된다.
  await page.evaluate(() => window.__sim.placeProduct('mug-ceramic'));
  await page.evaluate(() => {
    const second = window.__sim.placeProduct('mug-ceramic')!;
    window.__sim.liftItem(second.id, 740); // desk-oak-1200 상판 상단 = 740mm
  });
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__sim.collided())).toBe(true);
  await expect(page.getByTestId('collision-warning')).toBeVisible();
});
