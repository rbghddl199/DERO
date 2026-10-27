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

// 자석 결합·엣지 스냅·분리 (REQ-SIM-22·23, D22 — 2단계 엔진 API).
// 포인터 드래그는 플레이키하므로 __sim 훅 경로로 검증한다(포인터 경로는 3단계 UI e2e 몫).
// 좌표 근거: desk-oak-1200 상판 halfW=0.6 halfD=0.3 topY=0.74.
// 암 monitor-arm-white는 클램프 물림면이 로컬 -Z 뒤 끝이다(실측: mesh_1 후면).

/** 부착 트윈(MOUNT_DURATION_MS=180ms)이 정착하고도 남는 대기 — 결합 직후 좌표를 읽는
 *  스펙은 반드시 이걸 거쳐야 비행 중 값을 잡지 않는다 (D22 B, 2026-07-26 개정). */
const TWEEN_SETTLE_MS = 400;

const ARM_REACH = 0.19281; // 실측: 중심→클램프 물림면 (m). 규격 depth/2=0.1925보다 0.3mm 크다
// — GLB 균일 스케일이 높이 축 기준이라 깊이가 남는다. 엔진도 같은 실측값으로 스냅한다.

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(150);
}

test('1. 27" + 암 → 자석 결합(FIT), 관절을 움직이면 모니터가 따라온다', async ({ page }) => {
  await boot(page);
  const ids = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0)!;
    const mon = window.__sim.placeProductAt('monitor-27', 0.5, 0)!;
    const mount = window.__sim.mountMonitor(mon.id, arm.id);
    return { armId: arm.id, monId: mon.id, mount };
  });
  // 부착 트윈(180ms)이 정착할 때까지 기다린다 — 곧바로 읽으면 비행 중 좌표가 잡힌다.
  await page.waitForTimeout(TWEEN_SETTLE_MS);
  const res = await page.evaluate((d) => {
    const before = window.__sim.placedItems().find((i) => i.id === d.monId)!;
    window.__sim.articulate(d.armId, 'base-yaw', 45);
    const after = window.__sim.placedItems().find((i) => i.id === d.monId)!;
    return { ...d, before, after };
  }, ids);
  expect(res.mount!.mounted).toBe(true);
  expect(res.mount!.judgment.result).toBe('FIT');
  expect(res.before.mountedToId).toBe(res.armId);
  // 암 중심선 위, 헤드 앞쪽에 매달린다 (드래그 시작 위치 x=0.5에서 끌려왔다)
  expect(res.before.pos.x).toBeCloseTo(0, 2);
  expect(res.before.pos.z).toBeGreaterThan(0.15);
  // 관절 구동 → 부모 체인을 타고 모니터도 따라 움직인다
  const moved = Math.hypot(res.after.pos.x - res.before.pos.x, res.after.pos.z - res.before.pos.z);
  expect(moved).toBeGreaterThan(0.05);

  // 결합 중에는 이동·회전이 거부된다 (분리는 API로만, D22)
  const blocked = await page.evaluate(
    (id) => ({
      moved: window.__sim.moveItem(id, 0.4, 0.1),
      rotated: window.__sim.rotateItem(id, 90),
    }),
    res.monId,
  );
  expect(blocked.moved).toBe(false);
  expect(blocked.rotated).toBeNull();
});

test('2. 34" 커브드는 허용 하중 초과 → 자석 미발동 + 수치 사유', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0)!;
    const mon = window.__sim.placeProductAt('monitor-34-curved', 0.5, 0)!;
    const mount = window.__sim.mountMonitor(mon.id, arm.id);
    const item = window.__sim.placedItems().find((i) => i.id === mon.id)!;
    return { mount, item, eventKind: window.__sim.lastMountEvent()?.kind ?? null };
  });
  expect(res.mount!.mounted).toBe(false);
  expect(res.mount!.judgment.result).toBe('INCOMPATIBLE');
  expect(res.mount!.judgment.reasons.join(' ')).toContain('7.1kg');
  expect(res.item.mountedToId).toBeNull(); // 씬은 한 글자도 안 바뀐다
  expect(res.item.pos.x).toBeCloseTo(0.5, 3); // 놓았던 자리 그대로
  expect(res.eventKind).toBe('rejected');
});

test('3. 분리하면 스탠드가 돌아오고 모니터가 암 옆 상판으로 재스냅된다', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', -0.3, 0)!;
    const mon = window.__sim.placeProductAt('monitor-27', 0.5, 0)!;
    window.__sim.mountMonitor(mon.id, arm.id);
    const mountedParts = window.__sim.itemBounds(mon.id).partCount;
    const ok = window.__sim.detachMonitor(mon.id);
    return {
      ok,
      item: window.__sim.placedItems().find((i) => i.id === mon.id)!,
      mountedParts,
      detachedParts: window.__sim.itemBounds(mon.id).partCount,
      eventKind: window.__sim.lastMountEvent()?.kind ?? null,
      collided: window.__sim.collided(),
      boundary: window.__sim.boundaryViolation(),
    };
  });
  expect(res.ok).toBe(true);
  expect(res.item.mountedToId).toBeNull();
  expect(res.item.pos.y).toBeCloseTo(0.74, 3); // 상판 스냅 높이로 복귀
  expect(res.item.pos.x).toBeGreaterThan(-0.3); // 암 옆(+X)
  // 스탠드 복원 = 숨겨서 빠졌던 콜라이더 파트가 다시 생긴다
  expect(res.detachedParts).toBeGreaterThan(res.mountedParts);
  expect(res.eventKind).toBe('detached');
  // 재판정이 정상 동작한다 — 암 옆 빈 자리라 겹침·경계 위반 없음
  expect(res.collided).toBe(false);
  expect(res.boundary).toBe(false);
});

test('4. 암을 상판 뒷변 근처로 옮기면 엣지에 물린 자세로 정렬된다(FIT)', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate((reach) => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0.1)!;
    // 물림면이 뒷변(z=-0.3)에서 40mm 떨어진 위치 — 스냅 반경 80mm 안
    window.__sim.moveItem(arm.id, 0.2, -0.3 + reach + 0.04);
    window.__sim.selectItem(arm.id);
    return {
      item: window.__sim.placedItems().find((i) => i.id === arm.id)!,
      yawDeg: window.__sim.selectedItem()!.yawDeg,
      eventKind: window.__sim.lastMountEvent()?.kind ?? null,
      boundary: window.__sim.boundaryViolation(),
    };
  }, ARM_REACH);
  // 물림면이 뒷변 위로 정렬 — 변을 따르는 x는 끌던 값 그대로
  expect(res.item.pos.z).toBeCloseTo(-0.3 + ARM_REACH, 4);
  expect(res.item.pos.x).toBeCloseTo(0.2, 4);
  expect(res.yawDeg).toBe(0); // 뒷변 = 클램프가 -Z를 무는 자세
  expect(res.eventKind).toBe('edge-snapped');
  expect(res.boundary).toBe(false);
});

test('5. 스냅 반경 밖으로 끌면 풀린다', async ({ page }) => {
  await boot(page);
  const z = await page.evaluate((reach) => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0.1)!;
    window.__sim.moveItem(arm.id, 0, -0.3 + reach + 0.04); // 스냅
    window.__sim.moveItem(arm.id, 0, 0); // 네 변 모두 80mm 밖
    return window.__sim.placedItems().find((i) => i.id === arm.id)!.pos.z;
  }, ARM_REACH);
  expect(z).toBeCloseTo(0, 4);
});

test('6. 물림 두께 초과 책상(엣지 45mm)에서는 스냅하지 않고 사유만 낸다', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate((reach) => {
    // 월넛 규격 재현: 상판 30이지만 엣지 마감 45라 물림 두께 45 > 클램프 최대 40 (D21)
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 1200,
      depthMm: 600,
      heightMm: 740,
      topThicknessMm: 30,
      edgeThicknessMm: 45,
      materialId: 'walnut',
      frameType: 't-frame',
    });
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0.1)!;
    const target = -0.3 + reach + 0.04;
    window.__sim.moveItem(arm.id, 0.2, target);
    const e = window.__sim.lastMountEvent();
    return {
      item: window.__sim.placedItems().find((i) => i.id === arm.id)!,
      target,
      eventKind: e?.kind ?? null,
      reasons: e && 'judgment' in e ? e.judgment.reasons : [],
    };
  }, ARM_REACH);
  expect(res.item.pos.z).toBeCloseTo(res.target, 4); // 미스냅 — 끌던 자리 그대로
  expect(res.eventKind).toBe('edge-rejected');
  expect(res.reasons.join(' ')).toContain('45mm');

  // 암↔책상도 D22 ①층 **결합**이다 — "거치"(Phase 2 별개 층)로 부르면 안 된다.
  // 배너는 5초 자동 소멸이라 열화된 페이지에서 커밋 전에 사라질 수 있다(테스트 7과
  // 같은 경합). 엣지 이벤트는 armId별 시그니처 스로틀이 있어 반경 밖으로 뺐다가
  // 다시 넣어야 재발사된다.
  const banner = page.getByTestId('mount-banner');
  await expect(async () => {
    await page.evaluate(
      (p) => {
        const arm = window.__sim.placedItems().find((i) => i.specId === 'monitor-arm-white')!;
        window.__sim.moveItem(arm.id, 0, 0); // 스냅 반경 밖 — 스로틀 시그니처 해제
        window.__sim.moveItem(arm.id, 0.2, p.target); // 재접근 — edge-rejected 재발사
      },
      { target: res.target },
    );
    await expect(banner).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(banner).toContainText('결합 불가');
  await expect(banner).toContainText('45mm');
});

// --- 3단계 UI (판정 배너 · 분리 버튼) ------------------------------------------

test('7. UI — 결합 불가면 수치 사유 배너가 즉시 뜬다', async ({ page }) => {
  await boot(page);
  const ids = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0)!;
    const mon = window.__sim.placeProductAt('monitor-34-curved', 0.5, 0)!;
    return { arm: arm.id, mon: mon.id };
  });
  const banner = page.getByTestId('mount-banner');
  // 배너는 5초 자동 소멸이라 열화된 페이지에서는 커밋 전에 사라질 수 있다 —
  // 재시도마다 거절 이벤트를 다시 쏴서 wall-clock 경합을 없앤다(스로틀은 제스처
  // 경로에만 있고 mountMonitor 훅은 매 호출 발행한다).
  await expect(async () => {
    await page.evaluate((p) => void window.__sim.mountMonitor(p.mon, p.arm), ids);
    await expect(banner).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(banner).toContainText('불가'); // 화면 라벨 3종 중 하나 (D22)
  await expect(banner).toContainText('7.1kg'); // 사유는 수치 포함 완성 문구
  await expect(banner).toContainText('허용 5kg');
});

test('8. UI — 결합된 모니터를 선택하면 분리 버튼이 뜨고, 누르면 상판으로 돌아온다', async ({
  page,
}) => {
  await boot(page);
  const monId = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', -0.3, 0)!;
    const mon = window.__sim.placeProductAt('monitor-27', 0.5, 0)!;
    window.__sim.mountMonitor(mon.id, arm.id);
    window.__sim.selectItem(mon.id);
    return mon.id;
  });

  const detach = page.getByTestId('detach-button');
  await expect(detach).toBeVisible();
  await expect(page.getByTestId('mount-status')).toContainText('화이트 모니터암');
  await expect(page.getByTestId('mount-conditional')).toHaveCount(0); // 27"는 적합

  await detach.click();
  await expect(detach).toHaveCount(0); // 미결합이 되면 버튼 자체가 사라진다

  const item = await page.evaluate(
    (id) => window.__sim.placedItems().find((i) => i.id === id)!,
    monId,
  );
  expect(item.mountedToId).toBeNull();
  expect(item.pos.y).toBeCloseTo(0.74, 3); // 스탠드 복원 + 상판 스냅 높이
});

test('9. UI — 결합 안 된 아이템을 선택하면 분리 버튼이 없다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const mon = window.__sim.placeProductAt('monitor-27', 0.2, 0)!;
    window.__sim.selectItem(mon.id);
  });
  await expect(page.getByTestId('hud-selection')).toBeVisible();
  await expect(page.getByTestId('detach-button')).toHaveCount(0);
  await expect(page.getByTestId('mount-status')).toHaveCount(0);
});

// --- D22 2026-07-26 개정 (DERO-167): 부착 트윈 · 드래그 재분리 -------------
// 드래그 제스처 자체는 e2e에 넣지 않는다(포인터 드래그 스펙 상한 — e2e/CLAUDE.md).
// 재분리의 엔진 계약(`detachMonitor`의 at 옵션)만 훅으로 가둔다.

test('10. 부착은 순간이동이 아니라 트윈이다 — 결합은 즉시, 자세는 나중에 도착한다', async ({
  page,
}) => {
  await boot(page);
  // 같은 evaluate 안에서는 rAF가 돌지 않으므로 t=0 좌표가 결정적으로 잡힌다(플레이키 아님).
  const t0 = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', 0, 0)!;
    const mon = window.__sim.placeProductAt('monitor-27', 0.5, 0)!;
    const mount = window.__sim.mountMonitor(mon.id, arm.id);
    const item = window.__sim.placedItems().find((i) => i.id === mon.id)!;
    return { monId: mon.id, armId: arm.id, mounted: mount!.mounted, item };
  });
  // 결합은 이미 확정 — 트윈은 연출일 뿐 판정·부모 관계는 즉시다
  expect(t0.mounted).toBe(true);
  expect(t0.item.mountedToId).toBe(t0.armId);
  // 아직 출발점(놓기 직전 자리)에 있다
  expect(t0.item.pos.x).toBeCloseTo(0.5, 2);

  await page.waitForTimeout(TWEEN_SETTLE_MS);
  const settled = await page.evaluate(
    (id) => window.__sim.placedItems().find((i) => i.id === id)!,
    t0.monId,
  );
  // 목표(암 중심선 위, 헤드 앞쪽)에 정확히 안착했다
  expect(settled.pos.x).toBeCloseTo(0, 2);
  expect(settled.pos.z).toBeGreaterThan(0.15);
  expect(Math.abs(settled.pos.x - t0.item.pos.x)).toBeGreaterThan(0.1); // 실제로 움직였다
});

test('11. 드래그 재분리 — at 좌표로 되돌아오고 트윈이 취소된다', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(() => {
    const arm = window.__sim.placeProductAt('monitor-arm-white', -0.3, 0)!;
    const mon = window.__sim.placeProductAt('monitor-27', 0.5, 0)!;
    window.__sim.mountMonitor(mon.id, arm.id);
    // 트윈이 한 프레임도 못 돈 시점에 되뗀다 — 드래그 중 재분리의 최악 타이밍이다
    const ok = window.__sim.detachMonitor(mon.id, { at: { x: 0.35, z: 0.1 } });
    return { ok, monId: mon.id, item: window.__sim.placedItems().find((i) => i.id === mon.id)! };
  });
  expect(res.ok).toBe(true);
  expect(res.item.mountedToId).toBeNull();
  expect(res.item.pos.x).toBeCloseTo(0.35, 3); // 암 옆(+X)이 아니라 지정 좌표
  expect(res.item.pos.z).toBeCloseTo(0.1, 3);
  expect(res.item.pos.y).toBeCloseTo(0.74, 3); // 스탠드 복원 + 상판 스냅

  // 취소된 트윈이 뒤늦게 살아나 모니터를 암으로 도로 끌어가면 안 된다
  await page.waitForTimeout(TWEEN_SETTLE_MS);
  const after = await page.evaluate(
    (id) => window.__sim.placedItems().find((i) => i.id === id)!,
    res.monId,
  );
  expect(after.pos.x).toBeCloseTo(0.35, 3);
  expect(after.pos.z).toBeCloseTo(0.1, 3);
});
