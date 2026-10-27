import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// 충돌 무시 토글 — 판정은 그대로 돌고 경고·저장 차단·빨강 틴트만 걷힌다.
// 경계 위반(상판 밖·벽 관통)은 무시 대상이 아니라 계속 막힌다.
// 좌표 근거는 collision-overhaul.spec.ts와 동일 (desk-oak-1200 halfW=0.6 halfD=0.3 topY=0.74).

test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(150);
}

/** 같은 자리·같은 높이의 컵 두 개 — OBB가 확실히 겹친다.
 *
 *  **두 번째 컵을 상판 높이로 내리는 것이 이 픽스처의 핵심이다.** 같은 자리에 그냥
 *  떨어뜨리면 ADR-0023 결정 1대로 아래 컵의 규격 박스 상단에 **얹힌다**(게이트 없음) —
 *  그건 관입이 아니라 정상 스태킹이라 경고가 없다. 밑면 높이를 같게 만들어야 진짜 관입이
 *  된다(얹힘 추론은 `myBase <= otherBase`면 얹힘으로 보지 않는다 — 결정 5). */
async function placeOverlappingPair(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.__sim.placeProductAt('mug-ceramic', 0, 0);
    const second = window.__sim.placeProductAt('mug-ceramic', 0.01, 0)!;
    window.__sim.liftItem(second.id, 740); // desk-oak-1200 상판 상단 = 740mm
  });
  await page.waitForTimeout(100);
}

test('토글 OFF: 겹침이 경고 배너 + 저장 차단으로 잡힌다', async ({ page }) => {
  await boot(page);
  await placeOverlappingPair(page);

  expect(await page.evaluate(() => window.__sim.collided())).toBe(true);
  await expect(page.getByTestId('collision-warning')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__sim.trySave())).toMatchObject({
    ok: false,
    reason: 'violation',
  });
});

test('토글 ON: 배너가 숨고 저장이 통과한다 — 판정 자체는 그대로 참이다', async ({ page }) => {
  await boot(page);
  await placeOverlappingPair(page);
  await page.getByTestId('collision-ignore').click();
  await page.waitForTimeout(100);

  expect(await page.evaluate(() => window.__sim.collisionIgnored())).toBe(true);
  // 핵심 — 무시는 판정을 끄지 않는다. collided()가 false가 되면 회귀다.
  expect(await page.evaluate(() => window.__sim.collided())).toBe(true);
  await expect(page.getByTestId('collision-warning')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(true);
});

test('토글을 다시 끄면 경고·저장 차단이 복귀한다', async ({ page }) => {
  await boot(page);
  await placeOverlappingPair(page);
  const toggle = page.getByTestId('collision-ignore');
  await toggle.click();
  await page.waitForTimeout(100);
  await toggle.click();
  await page.waitForTimeout(100);

  expect(await page.evaluate(() => window.__sim.collisionIgnored())).toBe(false);
  await expect(page.getByTestId('collision-warning')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__sim.trySave())).toMatchObject({
    ok: false,
    reason: 'violation',
  });
});

test('경계 위반은 토글이 켜져 있어도 계속 저장을 막는다', async ({ page }) => {
  await boot(page);
  // 상판 우측 끝(halfW=0.6) 밖 — 지지 footprint가 상판을 벗어나 경계 위반이다.
  await page.evaluate(() => window.__sim.placeProductAt('deskmat-900', 0.55, 0));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__sim.boundaryViolation())).toBe(true);

  await page.getByTestId('collision-ignore').click();
  await page.waitForTimeout(100);

  await expect(page.getByTestId('collision-warning')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__sim.trySave())).toMatchObject({
    ok: false,
    reason: 'violation',
  });
});
