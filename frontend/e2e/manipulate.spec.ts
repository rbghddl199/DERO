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

// 배치 아이템 조작 — 이동(REQ-SIM-16) · 삭제(17) · 연속 회전(18) · 복제(19).
// 렌더 룩 판정은 하지 않는다(휴먼인더루프) — 상태 전이만 검증하므로 sampleRegion 미사용.

async function enterEmptySim(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(200);
}

test('moves a placed item and keeps it snapped to the surface', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  const before = await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.pos,
    id,
  );

  await page.evaluate((pid) => window.__sim.moveItem(pid, 0.25, -0.1), id);
  const after = await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.pos,
    id,
  );

  expect(after.x).toBeCloseTo(0.25, 3);
  expect(after.z).toBeCloseTo(-0.1, 3);
  // 상판 위 스냅 유지 — 이동은 높이를 건드리지 않는다.
  expect(after.y).toBeCloseTo(before.y, 4);
});

test('rotates continuously and normalises the angle to [0,360)', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;

  // 15도 스텝이 아니라 임의 실수각이 그대로 들어가야 한다 (연속 회전).
  expect(await page.evaluate((pid) => window.__sim.rotateItem(pid, 37.5), id)).toBeCloseTo(37.5, 4);
  expect(await page.evaluate((pid) => window.__sim.rotateItem(pid, 405), id)).toBeCloseTo(45, 4);
  expect(await page.evaluate((pid) => window.__sim.rotateItem(pid, -30), id)).toBeCloseTo(330, 4);
});

test('rotation changes the boundary verdict for an elongated item', async ({ page }) => {
  await enterEmptySim(page);
  // 상판 우측 끝에 걸쳐 두고, 90도 돌리면 폭↔깊이가 바뀌어 판정이 달라진다.
  const info = await page.evaluate(() => window.__sim.deskInfo());
  const edgeX = info.widthMm / 2000 - 0.1; // 키보드 반폭(0.18m)보다 작게 남긴다
  const id = (await page.evaluate(
    (x) => window.__sim.placeProductAt('keyboard-tkl', x, 0.1)!.id,
    edgeX,
  )) as string;

  const flat = await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.boundary,
    id,
  );
  await page.evaluate((pid) => window.__sim.rotateItem(pid, 90), id);
  const turned = await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.boundary,
    id,
  );

  expect(flat).toBe(true); // 360mm 폭이 상판 밖으로 나감
  expect(turned).toBe(false); // 140mm 깊이로 서면 안으로 들어옴
});

test('duplicates an item beside the original without overlapping', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(
    () => window.__sim.placeProductAt('mug-ceramic', -0.2, 0.1)!.id,
  )) as string;
  const copy = await page.evaluate((pid) => window.__sim.duplicateItem(pid), id);

  expect(copy).not.toBeNull();
  expect(copy!.collided).toBe(false);
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(2);
});

test('deletes via the HUD button and via the Delete key', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;

  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  await expect(page.getByTestId('hud-selection')).toBeVisible();
  await page.getByTestId('delete-item').click();
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(0);
  await expect(page.getByTestId('hud-selection')).toBeHidden();

  const id2 = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id2);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(0);
});

test('floating toolbar angle input drives rotation', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);

  // 입력은 Enter/blur에서만 커밋된다(타이핑 중 씬 불변) — fill()만으로는 회전하지 않는다.
  await page.getByTestId('rotate-angle').fill('123');
  await page.getByTestId('rotate-angle').press('Enter');
  await expect(page.getByTestId('rotate-angle')).toHaveValue('123');
  const yaw = await page.evaluate(() => window.__sim.selectedItem()!.yawDeg);
  expect(yaw).toBeCloseTo(123, 4);
});

test('Escape deselects the placed item', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  await expect(page.getByTestId('selection-toolbar')).toBeAttached();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
  await expect(page.getByTestId('hud-selection')).toBeHidden();
  // 해제일 뿐 삭제가 아니다 — Delete 키와 헷갈리면 안 된다.
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(1);
});
