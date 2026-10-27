import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// 배치 아이템 수동 3축(회전·기울기·높이) — 2026-08-04 ADR-0023으로 부활.
// 높이는 규격 박스 **밑면의 절대 높이**(0~2600mm)고 기울기는 ±75°다. 셋 다 저장되므로
// 마지막 테스트가 저장 → 재로드 왕복까지 본다. 렌더 룩 판정은 하지 않고 상태 전이·기하만 본다.
//
// 캔버스 실드래그는 이 파일에 넣지 않는다 — SwiftShader에서 비싸고 스펙당 1개가 상한이다
// (e2e/CLAUDE.md). 조작은 전부 __sim 훅 또는 HUD 입력으로 한다.

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

test('height is an absolute base height, clamped to 0~2600mm', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  // 드롭 순간은 지지면(상판 상단) 높이로 초기화된다 — 그 뒤로만 사용자 값이다.
  const dropped = await page.evaluate(() => window.__sim.selectedItem()!);
  expect(dropped.liftMm).toBeGreaterThan(700); // 상판 위 (책상 높이 720mm 급)

  expect(await page.evaluate((pid) => window.__sim.liftItem(pid, 900), id)).toBeCloseTo(900, 4);
  const raised = await page.evaluate(() => window.__sim.selectedItem()!);
  expect(raised.liftMm).toBeCloseTo(900, 4);
  // centerY는 규격 박스 중심이라 밑면 + 반높이다.
  expect(raised.centerY).toBeGreaterThan(0.9);

  // 상판 아래로도 내려간다 — 거치대 홈에 넣는 조작을 하드 클램프로 막지 않는다.
  expect(await page.evaluate((pid) => window.__sim.liftItem(pid, 400), id)).toBeCloseTo(400, 4);
  // 범위 밖은 양쪽 다 클램프.
  expect(await page.evaluate((pid) => window.__sim.liftItem(pid, -300), id)).toBe(0);
  expect(await page.evaluate((pid) => window.__sim.liftItem(pid, 99999), id)).toBe(2600);
});

test('a support removed leaves what sat on it exactly where the user put it', async ({ page }) => {
  await enterEmptySim(page);
  // 매트 위에 컵을 얹는다 — 컵은 매트 상단(규격 박스 상단) 높이로 시작한다.
  const matId = (await page.evaluate(
    () => window.__sim.placeProductAt('deskmat-900', 0, 0)!.id,
  )) as string;
  const mugId = (await page.evaluate(
    () => window.__sim.placeProductAt('mug-ceramic', 0, 0)!.id,
  )) as string;
  const onMat = (await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.pos.y,
    mugId,
  )) as number;

  // 받침을 치워도 위 아이템은 그 자리에 남는다 (ADR-0023 결정 4 — 따라 내려오지 않는다).
  await page.evaluate((pid) => window.__sim.removeItem(pid), matId);
  await page.waitForTimeout(120);
  const after = (await page.evaluate(
    (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.pos.y,
    mugId,
  )) as number;
  expect(after).toBeCloseTo(onMat, 6);
});

test('a seated item re-seats on whatever it is dragged onto — and back down', async ({ page }) => {
  await enterEmptySim(page);
  // 매트(900×400×4mm)는 원점, 컵(90mm)은 매트 밖 x=0.52(컵 rect 0.475~0.565, 매트 우변 0.45).
  await page.evaluate(() => window.__sim.placeProductAt('deskmat-900', 0, 0));
  const mugId = (await page.evaluate(
    () => window.__sim.placeProductAt('mug-ceramic', 0.52, 0)!.id,
  )) as string;
  const baseY = async (): Promise<number> =>
    (await page.evaluate(
      (pid) => window.__sim.placedItems().find((i) => i.id === pid)!.pos.y,
      mugId,
    )) as number;

  // 출발점이 상판 높이임을 먼저 단정한다 — 안 하면 "원래 그 높이였다"로도 통과한다.
  const onDesk = await baseY();
  const deskTopY = (await page.evaluate(() => window.__sim.deskInfo().heightMm / 1000)) as number;
  expect(onDesk).toBeCloseTo(deskTopY, 3);

  // 매트 위로 끌면 올라탄다 (드롭 경로만 앉히던 종전엔 상판 높이에 그대로 남았다).
  await page.evaluate((pid) => window.__sim.moveItem(pid, 0, 0), mugId);
  expect(await baseY()).toBeCloseTo(deskTopY + 0.004, 4);

  // 매트 밖으로 끌면 상판 높이로 내려온다 — 공중에 남지 않는다.
  await page.evaluate((pid) => window.__sim.moveItem(pid, 0.52, 0), mugId);
  expect(await baseY()).toBeCloseTo(onDesk, 6);

  // 수동 높이는 이동에도 유지된다 (ADR-0023 결정 4 — 자세는 사용자 소관).
  await page.evaluate((pid) => window.__sim.liftItem(pid, 900), mugId);
  await page.evaluate((pid) => window.__sim.moveItem(pid, 0, 0), mugId);
  expect(await baseY()).toBeCloseTo(0.9, 4);
});

test('tilt leans a yawed item about its own left-right axis, not the world X axis', async ({
  page,
}) => {
  await enterEmptySim(page);
  // 회전 오더 회귀 가드: 기본 'XYZ'면 pitch가 월드 X축으로 먹혀 90° 돌린 아이템이
  // 옆으로 기운다. 'YXZ'여야 아이템 로컬 좌우축을 축으로 앞뒤로 기운다.
  //
  // 판정은 "어느 월드축 폭이 **안 변하는가**"로 한다 — 그 축이 회전축이다. 변하는 쪽의
  // 부호·크기는 아이템 높이/깊이 비에 따라 늘 수도 줄 수도 있어(납작한 아이템은 줄어든다)
  // 방향으로 단언하면 제품에 종속된다. 모니터는 높아서 신호가 크다.
  const id = (await page.evaluate(() => window.__sim.placeProduct('monitor-27')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  await page.evaluate((pid) => window.__sim.rotateItem(pid, 90), id);
  const flat = await page.evaluate(() => window.__sim.selectedItem()!.worldBox);

  expect(await page.evaluate((pid) => window.__sim.tiltItem(pid, 30), id)).toBeCloseTo(30, 4);
  const tilted = await page.evaluate(() => window.__sim.selectedItem()!.worldBox);

  const dx = tilted.max.x - tilted.min.x - (flat.max.x - flat.min.x);
  const dz = tilted.max.z - tilted.min.z - (flat.max.z - flat.min.z);
  // yaw 90° 뒤 로컬 좌우축(회전축)은 월드 Z를 향한다 — Z 폭은 그대로, X 폭만 변한다.
  expect(Math.abs(dz)).toBeLessThan(1e-6);
  expect(Math.abs(dx)).toBeGreaterThan(0.01);
});

test('tilt clamps to the ±75° limit', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;
  expect(await page.evaluate((pid) => window.__sim.tiltItem(pid, 200), id)).toBe(75);
  expect(await page.evaluate((pid) => window.__sim.tiltItem(pid, -200), id)).toBe(-75);
});

test('the floating toolbar tilt input drives the engine', async ({ page }) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);

  // 입력은 Enter/blur에서만 커밋된다 — fill()만으로는 씬이 움직이지 않는다.
  await page.getByTestId('tilt-deg').fill('-20');
  await page.getByTestId('tilt-deg').press('Enter');
  await expect(page.getByTestId('tilt-deg')).toHaveValue('-20');
  expect(await page.evaluate(() => window.__sim.selectedItem()!.pitchDeg)).toBeCloseTo(-20, 4);

  // 값을 비우고 포커스를 잃어도 0으로 튀지 않는다(Number('') === 0 함정).
  await page.getByTestId('tilt-deg').fill('');
  await page.getByTestId('tilt-deg').blur();
  expect(await page.evaluate(() => window.__sim.selectedItem()!.pitchDeg)).toBeCloseTo(-20, 4);
});

test('the floating toolbar freezes its screen position while a control is used', async ({
  page,
}) => {
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  const toolbar = page.getByTestId('selection-toolbar');
  await expect(toolbar).toBeVisible();

  // 높이 입력도 툴바 소관이다(우측 패널에는 없다) — 여기서 씬이 움직이는지까지 본다.
  await page.getByTestId('lift-mm').fill('900');
  await page.getByTestId('lift-mm').press('Enter');
  expect(await page.evaluate(() => window.__sim.selectedItem()!.liftMm)).toBeCloseTo(900, 0);

  // 동결 검증 — ± 버튼을 누른 채로 아이템을 올려도 툴바는 그 자리에 있어야 한다.
  // (폐기 사유였던 '조작 중 툴바·마우스 동반 상승'을 막는 것이 이 티켓의 핵심이다.)
  //
  // ⚠ 위 900mm 커밋을 따라 툴바가 새 위치로 옮겨오는 데 몇 프레임 걸린다 — 정착 전에
  // before를 재면 그 추적 이동이 "동결 실패"로 잡힌다(실측 77px, 2026-08-04).
  await page.waitForTimeout(400);
  const before = (await toolbar.boundingBox())!;
  await page.getByTestId('lift-up').hover();
  await page.mouse.down();
  await page.waitForTimeout(600); // 300mm/s면 약 180mm 상승 — 툴바가 따라오면 확실히 보인다
  const during = (await toolbar.boundingBox())!;
  expect(Math.abs(during.y - before.y)).toBeLessThan(1);
  await page.mouse.up();

  // 조작이 끝나면 다시 추적한다 — 올라간 아이템을 따라 툴바도 위로 올라와야 한다.
  await page.waitForTimeout(200);
  const after = (await toolbar.boundingBox())!;
  expect(after.y).toBeLessThan(before.y);
});

test('edit lock blocks tilt', async ({ page }) => {
  // SwiftShader에서 씬 진입 한 번이 이미 60s 예산의 대부분을 먹는다 — 이 파일 뒤쪽 스펙은
  // 여유를 준다(e2e/CLAUDE.md의 긴 세션 누적 항목과 같은 원인).
  test.slow();
  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('mug-ceramic')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  await page.getByTestId('edit-lock').click();

  await expect(page.getByTestId('tilt-deg')).toBeDisabled();
  await expect(page.getByTestId('delete-item')).toBeDisabled();
  // 선택 해제는 씬을 바꾸지 않으므로 잠금 중에도 살아 있다.
  await expect(page.getByTestId('deselect-item')).toBeEnabled();

  // 비활성화되지 않는 경로(Delete 키)로 스토어 게이트 자체도 확인한다 — 엔진 훅은
  // 게이트 밖이라 UI 아닌 경로로 검증해야 한다.
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.__sim.placedCount())).toBe(1);
});

test('all three axes round-trip through save and reload', async ({ page }) => {
  test.slow(); // 씬 진입이 두 번(저장 전·재로드 후)이라 기본 60s 예산으로는 못 끝난다

  // 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 저장 요청 본문을 가로채 그대로 상세 응답으로
  // 되돌려 준다 — 이 왕복이 검증하는 것은 프론트의 저장·복원 배선이다.
  const PLACEMENT_ID = 4242;
  let saved: { items: Record<string, unknown>[] } | null = null;

  await page.route('**/api/v1/placements', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: PLACEMENT_ID,
        updatedAt: '2026-08-04T00:00:00Z',
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
        title: '왕복 테스트',
        budgetKrw: 0,
        version: 1,
        publishStatus: 'PRIVATE',
        isRoomLightOn: true,
        desk: {
          specSource: 'CUSTOM',
          widthMm: 1200,
          depthMm: 600,
          heightMm: 720,
          topThicknessMm: 25,
          edgeThicknessMm: 25,
          frameType: 'FOUR_LEG',
        },
        // 저장 스냅샷의 아이템을 그대로 상세 응답 모양으로 옮긴다(id만 채운다).
        items: (saved?.items ?? []).map((it, i) => ({ ...it, id: i + 1 })),
      }),
    });
  });

  await enterEmptySim(page);
  const id = (await page.evaluate(() => window.__sim.placeProduct('keyboard-tkl')!.id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  await page.evaluate((pid) => window.__sim.rotateItem(pid, 90), id);
  await page.evaluate((pid) => window.__sim.tiltItem(pid, 40), id);
  await page.evaluate((pid) => window.__sim.liftItem(pid, 820), id);

  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(true);
  await expect.poll(() => saved !== null, { timeout: 15_000 }).toBe(true);
  const item = saved!.items[0] as { rotationDeg: number; pitchDeg: number; positionYMm: number };
  expect(item.rotationDeg).toBeCloseTo(90, 4);
  expect(item.pitchDeg).toBeCloseTo(40, 4);
  // 저장되는 y는 규격 박스 **중심**이다(밑면 820mm + 반높이).
  expect(item.positionYMm).toBeGreaterThan(820);

  // 재로드: 같은 배치를 다시 열면 세 축이 저장값 그대로 살아난다(로드 시 재계산 없음).
  await page.goto(`/simulator?deskProjectId=${PLACEMENT_ID}`);
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  // 로드는 GLB 템플릿 확보까지 기다리므로 SwiftShader에서 15s를 넘길 수 있다.
  await expect
    .poll(() => page.evaluate(() => window.__sim.placedCount()), { timeout: 60_000 })
    .toBe(1);
  const reloadedId = (await page.evaluate(() => window.__sim.placedItems()[0].id)) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), reloadedId);
  const restored = await page.evaluate(() => window.__sim.selectedItem()!);
  expect(restored.yawDeg).toBeCloseTo(90, 4);
  expect(restored.pitchDeg).toBeCloseTo(40, 4);
  expect(restored.liftMm).toBeCloseTo(820, 0);
});
