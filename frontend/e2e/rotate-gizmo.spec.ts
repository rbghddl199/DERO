import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// 회전 직접 조작 (REQ-SIM-18 개정, ADR-0022 결정 7) — 발밑 회전 링 + R 키 45°.
// 링 드래그의 각도 수학은 `tests/rotateSnap.test.ts`(유닛)가 정본이고, 여기서는
// 링이 실제로 씬에 뜨는지와 R 키 배선(선택 아이템 / 라이브러리 고스트)을 본다.
// 렌더 룩 판정은 하지 않는다(휴먼인더루프).
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

async function enterEmptySim(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(200);
}

test('shows a rotate ring at the selected item base and hides it on deselect', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;

  // 선택 전에는 링이 없다.
  expect(await page.evaluate(() => window.__sim.rotateRing().visible)).toBe(false);

  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  const ring = await page.evaluate(() => window.__sim.rotateRing());
  expect(ring.visible).toBe(true);
  expect(ring.hasRing).toBe(true);
  // 링은 규격 footprint 밖에 있어야 집을 자리가 남는다 (대각 반지름 + 여유).
  expect(ring.radius!).toBeGreaterThan(0.19);
  // 발밑 = 지지면(상판) 바로 위 — 아이템 중앙 높이가 아니다.
  const topY = await page.evaluate(() => window.__sim.deskInfo().surfaceTopY);
  expect(ring.centerY!).toBeCloseTo(topY, 2);

  await page.evaluate(() => window.__sim.selectItem(null));
  expect(await page.evaluate(() => window.__sim.rotateRing().visible)).toBe(false);
});

test('R key rotates the selected item by 45 degrees per press', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);

  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__sim.selectedItem()!.yawDeg)).toBeCloseTo(45, 4);
  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__sim.selectedItem()!.yawDeg)).toBeCloseTo(90, 4);

  // [0,360) 정규화 — 8번 누르면 제자리다.
  for (let i = 0; i < 6; i++) await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__sim.selectedItem()!.yawDeg)).toBeCloseTo(0, 4);
});

// 이 파일의 유일한 실제 캔버스 드래그 — SwiftShader에서 드래그 1회가 55s급이라
// 파일당 하나로 제한한다 (e2e/CLAUDE.md 상시 이슈).
test('R key rotates the library drag ghost and the drop keeps that angle', async ({ page }) => {
  // 실측: 부팅 12s + 스텝 드래그 45s로 기본 60s 예산을 드롭 검증 직전에 소진했다.
  test.setTimeout(150_000);
  await enterEmptySim(page);

  await page.getByTestId('rail-product').click();
  // 키보드는 '키보드 · 마우스' 타일 소속이다(2026-08-05 카테고리 10종 개편).
  await page.getByTestId('category-keyboard-mouse').click();
  const card = page.getByTestId('lib-card-keyboard-tkl');
  const canvas = page.getByTestId('sim-canvas');
  await card.hover();
  const cardBox = (await card.boundingBox())!;
  const cBox = (await canvas.boundingBox())!;
  const sx = cardBox.x + cardBox.width / 2;
  const sy = cardBox.y + cardBox.height / 2;
  const tx = cBox.x + cBox.width / 2;
  const ty = cBox.y + cBox.height * 0.62;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6);
    await page.waitForTimeout(15);
  }
  // 드래그 도중 회전 — 고스트가 돌고, 그 각도가 드롭에 그대로 물려야 한다.
  await page.keyboard.press('r');
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const items = await page.evaluate(() => window.__sim.placedItems());
  expect(items.length).toBe(1);
  await page.evaluate((pid) => window.__sim.selectItem(pid), items[0].id);
  expect(await page.evaluate(() => window.__sim.selectedItem()!.yawDeg)).toBeCloseTo(45, 4);
});
