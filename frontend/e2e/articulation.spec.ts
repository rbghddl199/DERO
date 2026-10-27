import { test, expect, type Page } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁 없이 goto하면 /login으로
// 튕겨 씬이 뜨지 않는다. Playwright에 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 프론트가
// 실제로 부르는 인증 엔드포인트만 네트워크 레벨로 막는다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

// GLB pipeline + FK articulation gates. joints.length distinguishes the real
// loader/KTX2/meshopt/instantiate path from the silent parametric fallback:
// scene.placeAt substitutes buildProp when the template is missing, and only a
// GLB-instantiated monitor arm carries the 5 rig-manifest joints. Console
// errors are captured on both tests — preload failures log console.error.

async function bootEmpty(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.__sim.enterSim('desk-oak-1200');
    window.__sim.reset();
  });
  return errors;
}

test('monitor arm places via the GLB template and clamps joints to spec-DB limits', async ({
  page,
}) => {
  const errors = await bootEmpty(page);

  await page.evaluate(() => window.__sim.placeProduct('monitor-arm-white'));
  const items = await page.evaluate(() => window.__sim.placedItems());
  const arm = items.find((i) => i.specId === 'monitor-arm-white');
  expect(arm).toBeTruthy();
  // 5 joints exist ONLY when the GLB template instantiated (fallback box has 0)
  expect(arm!.joints).toEqual([
    'base-yaw',
    'elbow-pitch',
    'head-tilt',
    'head-swivel',
    'head-pivot',
  ]);

  // runtime clamp: far beyond the elbow-pitch max -> applied value = spec max 35
  const applied = await page.evaluate(
    (id) => window.__sim.articulate(id, 'elbow-pitch', 999),
    arm!.id,
  );
  expect(applied).toBe(35);
  const states = await page.evaluate((id) => window.__sim.jointStates(id), arm!.id);
  const elbow = states.find((s) => s.id === 'elbow-pitch')!;
  expect(elbow.value).toBe(35); // bookkeeping reflects the clamped value
  expect(elbow.min).toBe(-35); // limits come from the spec-DB manifest
  expect(elbow.max).toBe(35);
  expect(elbow.label).toBe('팔꿈치 각도'); // UI는 내부 id가 아니라 표시명을 쓴다
  expect(elbow.unit).toBe('°');

  // unknown joint id -> null, never a silent success
  const unknown = await page.evaluate((id) => window.__sim.articulate(id, 'no-such', 10), arm!.id);
  expect(unknown).toBeNull();

  // gizmo 핸들: driver 관절 5개, 월드 좌표·축이 유효한 수 (렌더 여부는 시각 QA)
  const handles = await page.evaluate((id) => window.__sim.jointHandles(id), arm!.id);
  expect(handles.map((h) => h.id)).toEqual([
    'base-yaw',
    'elbow-pitch',
    'head-tilt',
    'head-swivel',
    'head-pivot',
  ]);
  for (const h of handles) {
    expect(h.point.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...h.axis)).toBeCloseTo(1, 3);
  }
  // base-yaw를 90도로 돌리면 팔꿈치 핸들의 축이 함께 돈다(FK 부모 체인 반영)
  const before = handles.find((h) => h.id === 'elbow-pitch')!.axis;
  await page.evaluate((id) => window.__sim.articulate(id, 'base-yaw', 90), arm!.id);
  const after = (await page.evaluate((id) => window.__sim.jointHandles(id), arm!.id)).find(
    (h) => h.id === 'elbow-pitch',
  )!.axis;
  expect(after[0]).not.toBeCloseTo(before[0], 2);

  // 슬라이더 동기화(코드리뷰 지적): articulate 후 HUD 슬라이더 DOM 값이 따라온다.
  // JointSliders가 로컬 state로 값을 들고 있으면 마운트 후엔 store 갱신을 영영 안 읽어
  // 값이 절대 안 움직인다 — 패널이 뜨려면 먼저 선택이 필요하다.
  await page.evaluate((id) => window.__sim.selectItem(id), arm!.id);
  await page.evaluate((id) => window.__sim.articulate(id, 'elbow-pitch', 20), arm!.id);
  await expect(page.getByTestId('joint-elbow-pitch')).toHaveValue('20');

  expect(errors).toEqual([]);
});

test('textured GLB decor (KTX2) places without load errors', async ({ page }) => {
  const errors = await bootEmpty(page);

  const before = await page.evaluate(() => window.__sim.placedCount());
  await page.evaluate(() => window.__sim.placeProduct('decor-waves'));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(before + 1);
  // KTX2/meshopt load failures surface as console.error via the preload catch
  expect(errors).toEqual([]);
});
