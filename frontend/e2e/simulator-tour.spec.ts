import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { readCoachTourSeen } from './helpers/tour';

// 첫 입장 코치마크 투어 — 이 스펙만 seedCoachTourSeen을 부르지 않는다(첫 입장을 재현해야 한다).
// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁이 없으면 /login으로 튕긴다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
});

const TOUR = 'sim-coach-tour';

async function bootSim(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await expect(page.getByTestId('screen-sim')).toBeVisible();
}

test('첫 입장이면 1단계부터 뜬다', async ({ page }) => {
  await bootSim(page);

  await expect(page.getByTestId(TOUR)).toBeVisible();
  await expect(page.getByTestId('coach-counter')).toHaveText('1 / 6');
  await expect(page.getByTestId('coach-bubble')).toContainText('3D 화면 살펴보기');
  await expect(page.getByTestId('coach-next')).toHaveText('다음');
});

test('클릭으로 6단계를 지나면 완료로 끝나고 기록이 남는다', async ({ page }) => {
  await bootSim(page);
  await expect(page.getByTestId(TOUR)).toBeVisible();

  for (let i = 2; i <= 6; i += 1) {
    await page.getByTestId(TOUR).click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('coach-counter')).toHaveText(`${i} / 6`);
  }
  await expect(page.getByTestId('coach-next')).toHaveText('완료');

  await page.getByTestId('coach-next').click();
  await expect(page.getByTestId(TOUR)).toHaveCount(0);
  expect(await readCoachTourSeen(page)).toBe(true);
});

// 회귀 가드: '다음' 버튼 클릭이 오버레이 루트로 버블링되면 한 클릭에 두 단계가 진행돼
// 홀수 번째 단계만 보인다(2026-08-03 실사고). 위 배경 클릭 경로로는 안 잡힌다.
test("'다음' 버튼은 한 클릭에 한 단계만 진행한다", async ({ page }) => {
  await bootSim(page);
  await expect(page.getByTestId('coach-counter')).toHaveText('1 / 6');

  await page.getByTestId('coach-next').click();
  await expect(page.getByTestId('coach-counter')).toHaveText('2 / 6');

  await page.getByTestId('coach-next').click();
  await expect(page.getByTestId('coach-counter')).toHaveText('3 / 6');
});

test('두 번째 입장에는 뜨지 않는다', async ({ page }) => {
  await bootSim(page);
  await expect(page.getByTestId(TOUR)).toBeVisible();
  await page.getByTestId('coach-skip').click();

  await page.reload();
  await expect(page.getByTestId('screen-sim')).toBeVisible();
  await expect(page.getByTestId(TOUR)).toHaveCount(0);
});

test('건너뛰기는 중간 단계에서도 즉시 끝내고 기록을 남긴다', async ({ page }) => {
  await bootSim(page);
  await page.getByTestId(TOUR).click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('coach-counter')).toHaveText('2 / 6');

  await page.getByTestId('coach-skip').click();
  await expect(page.getByTestId(TOUR)).toHaveCount(0);
  expect(await readCoachTourSeen(page)).toBe(true);
});

test('ESC도 같은 종료 경로다', async ({ page }) => {
  await bootSim(page);
  await page.getByTestId(TOUR).click({ position: { x: 5, y: 5 } });
  await page.getByTestId(TOUR).click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('coach-counter')).toHaveText('3 / 6');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TOUR)).toHaveCount(0);
  expect(await readCoachTourSeen(page)).toBe(true);
});

test('스포트라이트가 2단계 대상(제품 레일 버튼)을 감싼다', async ({ page }) => {
  await bootSim(page);
  await page.getByTestId(TOUR).click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('coach-counter')).toHaveText('2 / 6');

  const target = await page.getByTestId('rail-product').boundingBox();
  expect(target).not.toBeNull();
  // getBoundingClientRect는 이 환경(document.hidden)에서 낡은 값을 준다 — 인라인 style로 잰다.
  const hole = await page.getByTestId('coach-spotlight').evaluate((el) => {
    const style = (el as HTMLElement).style;
    return {
      left: parseFloat(style.left),
      top: parseFloat(style.top),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
    };
  });

  const rect = target as { x: number; y: number; width: number; height: number };
  const pad = 8;
  expect(hole.left).toBeCloseTo(rect.x - pad, 0);
  expect(hole.top).toBeCloseTo(rect.y - pad, 0);
  expect(hole.width).toBeCloseTo(rect.width + pad * 2, 0);
  expect(hole.height).toBeCloseTo(rect.height + pad * 2, 0);
});

test('투어 중 포인터는 캔버스가 아니라 오버레이가 받는다', async ({ page }) => {
  await bootSim(page);
  await expect(page.getByTestId(TOUR)).toBeVisible();

  // 오빗은 캔버스의 pointerdown에서 시작한다 — 화면 가운데의 히트 대상이 투어 안이면
  // 캔버스에 도달하지 못한다(controls.enabled를 끄지 않고 막는 방식, 로딩 화면과 같은 규약).
  const ownerTestId = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const root = el?.closest('[data-testid]');
    return root?.getAttribute('data-testid') ?? null;
  });

  expect(['sim-coach-tour', 'coach-bubble', 'coach-spotlight']).toContain(ownerTestId);
});

test('투어 중에는 Delete 단축키가 아이템을 지우지 않는다', async ({ page }) => {
  await bootSim(page);
  await expect(page.getByTestId(TOUR)).toBeVisible();

  const id = await page.evaluate(() => window.__sim.placeProductAt('monitor-27', 0, -0.15)?.id);
  expect(id).toBeTruthy();
  await page.evaluate((itemId) => window.__sim.selectItem(itemId as string), id);
  const before = await page.evaluate(() => window.__sim.placedCount());

  await page.keyboard.press('Delete');

  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(before);
});
