import { describe, it, expect } from 'vitest';
import {
  surfaceTopYFromFloor,
  snapCenterY,
  baseY,
  restsOnSurface,
  clampDropM,
} from '../src/three/core/snap';
import {
  rectsOverlapXZ,
  rectInsideRect,
  specFootprintRect,
  rotatedFootprintRect,
  supportTopY,
  supportSurfaces,
  clampCenterToWalls,
  clampCenterToWallsAlongEdge,
  isFloorMounted,
  isWallMounted,
  usesDeskSnap,
  sharesMountPlane,
  baseSupportY,
  violatesDeskBoundary,
  DESK_BOUNDARY_EPS_M,
  RIG_BOUNDARY_EPS_M,
  clampAlongEdgeToDesk,
  clampWallCenterY,
  resolveWallPose,
  resolvePegboardPose,
  resolveHookHangPose,
  resolveMonitorTopPose,
  restsOnMonitorTop,
  isPegboardMounted,
  wallAlongAxis,
  wallNormalAxis,
  WALL_HEIGHT_M,
  WALL_YAW_DEG,
  type WallPlanes,
  type RectXZ,
} from '../src/three/core/snap';
import { getProduct } from '../src/three/scene/product';

const desk = getProduct('desk-oak-1200')!;
const monitor = getProduct('monitor-27')!;

describe('clampDropM (T2 회귀 — 클램프가 상판을 안 물고 위에 얹힘)', () => {
  it('클램프 조가 아이템 최하단이면 낙차가 곧 물림 두께다', () => {
    // 상판 25mm를 물면 조 바닥이 상판 아랫면(상면 -25mm)에 닿아야 한다.
    expect(clampDropM(25, 0, 0)).toBeCloseTo(0.025, 9);
  });

  it('조가 아이템 바닥보다 높으면 그 높이만큼 더 내린다', () => {
    // 조 바닥이 아이템 바닥보다 12mm 위 → 25 + 12 = 37mm 내려야 조가 아랫면에 닿는다.
    expect(clampDropM(25, 0.012, 0)).toBeCloseTo(0.037, 9);
  });

  it('아이템 로컬 원점이 바닥이 아니어도 두 minY의 차만 본다', () => {
    expect(clampDropM(25, 0.012, 0.004)).toBeCloseTo(0.033, 9);
    expect(clampDropM(25, -0.02, -0.02)).toBeCloseTo(0.025, 9);
  });

  it('두꺼운 상판일수록 더 깊이 내려간다 (엣지 마감이 이긴 경우 포함)', () => {
    expect(clampDropM(45, 0, 0)).toBeGreaterThan(clampDropM(25, 0, 0));
  });
});

describe('surface snap', () => {
  it('desk top height maps mm->m', () => {
    expect(surfaceTopYFromFloor(desk)).toBeCloseTo(0.74, 6);
  });

  it('snaps an item so its base rests on the surface top', () => {
    const top = surfaceTopYFromFloor(desk);
    const cy = snapCenterY(monitor, top);
    // centre is half the monitor height above the surface
    expect(cy).toBeCloseTo(0.74 + monitor.heightMm / 1000 / 2, 6);
    expect(baseY(monitor, cy)).toBeCloseTo(top, 6);
    expect(restsOnSurface(cy, monitor, top)).toBe(true);
  });

  it('detects floating (above) and sunk (penetrating) placements', () => {
    const top = surfaceTopYFromFloor(desk);
    const cy = snapCenterY(monitor, top);
    expect(restsOnSurface(cy + 0.05, monitor, top)).toBe(false); // floating
    expect(restsOnSurface(cy - 0.05, monitor, top)).toBe(false); // sunk
    // never penetrates when snapped
    expect(baseY(monitor, cy)).toBeGreaterThanOrEqual(top - 1e-6);
  });
});

describe('RectXZ helpers', () => {
  const a = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  it('overlap true/false/edge-touch', () => {
    expect(rectsOverlapXZ(a, { minX: 0.5, maxX: 1.5, minZ: 0.5, maxZ: 1.5 })).toBe(true);
    expect(rectsOverlapXZ(a, { minX: 2, maxX: 3, minZ: 0, maxZ: 1 })).toBe(false);
    expect(rectsOverlapXZ(a, { minX: 1, maxX: 2, minZ: 0, maxZ: 1 })).toBe(false);
  });
  it('inside containment (edge contact allowed)', () => {
    expect(rectInsideRect({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, a)).toBe(true);
    expect(rectInsideRect({ minX: -0.1, maxX: 1, minZ: 0, maxZ: 1 }, a)).toBe(false);
  });
  it('specFootprintRect centres spec dims (m)', () => {
    const kb = getProduct('keyboard-tkl')!;
    const r = specFootprintRect(kb, 0.1, -0.2);
    expect(r.minX).toBeCloseTo(0.1 - 0.18, 6);
    expect(r.maxZ).toBeCloseTo(-0.2 + 0.07, 6);
  });
});

describe('rotatedFootprintRect (연속 yaw 회전)', () => {
  const kb = getProduct('keyboard-tkl')!; // 360 x 140 mm
  const hx = kb.widthMm / 2000;
  const hz = kb.depthMm / 2000;

  it('0도는 specFootprintRect와 동일', () => {
    const r = rotatedFootprintRect(kb, 0.1, -0.2, 0);
    const base = specFootprintRect(kb, 0.1, -0.2);
    expect(r.minX).toBeCloseTo(base.minX, 9);
    expect(r.maxX).toBeCloseTo(base.maxX, 9);
    expect(r.minZ).toBeCloseTo(base.minZ, 9);
    expect(r.maxZ).toBeCloseTo(base.maxZ, 9);
  });

  it('90도는 폭과 깊이가 뒤바뀐다', () => {
    const r = rotatedFootprintRect(kb, 0, 0, Math.PI / 2);
    expect(r.maxX - r.minX).toBeCloseTo(hz * 2, 9);
    expect(r.maxZ - r.minZ).toBeCloseTo(hx * 2, 9);
  });

  it('180도는 0도와 같은 사각형 (대칭)', () => {
    const r = rotatedFootprintRect(kb, 0.3, 0.4, Math.PI);
    const base = specFootprintRect(kb, 0.3, 0.4);
    expect(r.minX).toBeCloseTo(base.minX, 9);
    expect(r.maxZ).toBeCloseTo(base.maxZ, 9);
  });

  it('45도는 두 축 모두 대각으로 확장된다', () => {
    const r = rotatedFootprintRect(kb, 0, 0, Math.PI / 4);
    const diag = (hx + hz) * Math.SQRT1_2;
    expect(r.maxX).toBeCloseTo(diag, 9);
    expect(r.maxZ).toBeCloseTo(diag, 9);
    // 길쭉한 사각형은 회전하면 긴 축이 줄고 짧은 축이 는다 — 축정렬 가정과
    // 어긋나는 지점(경계 판정이 달라지는 이유).
    expect(r.maxX).toBeLessThan(hx);
    expect(r.maxZ).toBeGreaterThan(hz);
  });

  it('음수 각도도 같은 크기 (부호 무관)', () => {
    const a = rotatedFootprintRect(kb, 0, 0, -Math.PI / 3);
    const b = rotatedFootprintRect(kb, 0, 0, Math.PI / 3);
    expect(a.maxX).toBeCloseTo(b.maxX, 9);
    expect(a.maxZ).toBeCloseTo(b.maxZ, 9);
  });

  it('중심은 회전과 무관하게 (cx, cz)에 머문다', () => {
    const r = rotatedFootprintRect(kb, 0.25, -0.15, 1.1);
    expect((r.minX + r.maxX) / 2).toBeCloseTo(0.25, 9);
    expect((r.minZ + r.maxZ) / 2).toBeCloseTo(-0.15, 9);
  });
});

describe('clampCenterToWalls (하드 클램프)', () => {
  const walls: WallPlanes = { leftX: -1.55, rightX: 1.55, frontZ: -0.35 };
  const kb = getProduct('keyboard-tkl')!; // 360 x 140 mm

  it('왼쪽 벽 밖이면 반폭만큼 안쪽으로 민다', () => {
    const rect = rotatedFootprintRect(kb, -2, 0, 0);
    const c = clampCenterToWalls(-2, 0, rect, walls);
    expect(c.x).toBeCloseTo(-1.55 + 0.18, 9);
    expect(c.z).toBeCloseTo(0, 9);
  });

  it('오른쪽 벽 밖이면 반폭만큼 안쪽으로 민다', () => {
    const rect = rotatedFootprintRect(kb, 2, 0, 0);
    const c = clampCenterToWalls(2, 0, rect, walls);
    expect(c.x).toBeCloseTo(1.55 - 0.18, 9);
  });

  it('전면 벽 밖이면 반깊이만큼 앞으로 민다 (뒷벽은 없다)', () => {
    const rect = rotatedFootprintRect(kb, 0, -1, 0);
    const c = clampCenterToWalls(0, -1, rect, walls);
    expect(c.z).toBeCloseTo(-0.35 + 0.07, 9);
    const back = rotatedFootprintRect(kb, 0, 5, 0);
    expect(clampCenterToWalls(0, 5, back, walls).z).toBeCloseTo(5, 9);
  });

  it('모든 벽이 꺼져 있으면 원본 그대로', () => {
    const rect = rotatedFootprintRect(kb, -3, -3, 0);
    const c = clampCenterToWalls(-3, -3, rect, {});
    expect(c.x).toBeCloseTo(-3, 9);
    expect(c.z).toBeCloseTo(-3, 9);
  });

  it('이미 안쪽이면 움직이지 않는다', () => {
    const rect = rotatedFootprintRect(kb, 0.2, 0.1, 0);
    const c = clampCenterToWalls(0.2, 0.1, rect, walls);
    expect(c.x).toBeCloseTo(0.2, 9);
    expect(c.z).toBeCloseTo(0.1, 9);
  });

  it('45° 회전 footprint는 대각 반폭 기준으로 클램프한다', () => {
    const rect = rotatedFootprintRect(kb, -2, -1, Math.PI / 4);
    const diag = (kb.widthMm / 2000 + kb.depthMm / 2000) * Math.SQRT1_2;
    const c = clampCenterToWalls(-2, -1, rect, walls);
    expect(c.x).toBeCloseTo(-1.55 + diag, 9);
    expect(c.z).toBeCloseTo(-0.35 + diag, 9);
  });

  it('클램프 결과의 footprint는 켜진 벽 안에 들어온다', () => {
    const rect = rotatedFootprintRect(kb, -2, -1, Math.PI / 4);
    const c = clampCenterToWalls(-2, -1, rect, walls);
    const out = rotatedFootprintRect(kb, c.x, c.z, Math.PI / 4);
    expect(out.minX).toBeGreaterThanOrEqual(walls.leftX! - 1e-9);
    expect(out.maxX).toBeLessThanOrEqual(walls.rightX! + 1e-9);
    expect(out.minZ).toBeGreaterThanOrEqual(walls.frontZ! - 1e-9);
  });
});

describe('supportTopY (규격 박스 스태킹, ADR-0023 결정 1)', () => {
  const deskTop = 0.74;
  const mat = { rect: { minX: -0.45, maxX: 0.45, minZ: -0.1, maxZ: 0.3 }, topY: 0.744 };
  it('keyboard over the mat rests on the mat top', () => {
    const kb = { minX: -0.18, maxX: 0.18, minZ: 0.03, maxZ: 0.17 };
    expect(supportTopY(kb, deskTop, [mat])).toBeCloseTo(0.744, 6);
  });
  it('disjoint footprint stays on the desk top', () => {
    const kb = { minX: 0.5, maxX: 0.86, minZ: 0.03, maxZ: 0.17 };
    expect(supportTopY(kb, deskTop, [mat])).toBeCloseTo(0.74, 6);
  });
  it('multiple supports pick the highest overlapping one', () => {
    const riser = { rect: { minX: -0.2, maxX: 0.2, minZ: 0, maxZ: 0.2 }, topY: 0.84 };
    const kb = { minX: -0.18, maxX: 0.18, minZ: 0.03, maxZ: 0.17 };
    expect(supportTopY(kb, deskTop, [mat, riser])).toBeCloseTo(0.84, 6);
  });
  it('아래 아이템이 상판보다 낮아도 상판이 바닥값이다 (지지면은 최상단이다)', () => {
    const sunk = { rect: { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 }, topY: 0.3 };
    const kb = { minX: -0.18, maxX: 0.18, minZ: 0.03, maxZ: 0.17 };
    expect(supportTopY(kb, deskTop, [sunk])).toBeCloseTo(0.74, 6);
  });
});

describe('supportSurfaces — 모니터는 발판만 내놓는다 (DERO-431)', () => {
  const deskTop = 0.74;
  const standDepthM = monitor.monitor!.standDepthMm / 1000;
  const footTopM = 0.014;
  /** 상판에 그냥 놓인 모니터의 규격 박스 중심. */
  const center = { x: 0, y: deskTop + monitor.heightMm / 2000, z: 0 };
  const surfaces = supportSurfaces(monitor, center, 0);

  it('정적 소품은 종전대로 규격 박스 상단 하나다 (무회귀)', () => {
    const mug = getProduct('mug-ceramic')!;
    const out = supportSurfaces(mug, { x: 0.3, y: deskTop + mug.heightMm / 2000, z: 0.1 }, 0);
    expect(out).toHaveLength(1);
    expect(out[0].rect).toEqual(rotatedFootprintRect(mug, 0.3, 0.1, 0));
    expect(out[0].topY).toBeCloseTo(deskTop + mug.heightMm / 1000, 9);
  });

  it('모니터 지지면은 발판 하나 — 폭이 패널(614mm)이 아니라 200mm다', () => {
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].rect.maxX - surfaces[0].rect.minX).toBeCloseTo(0.2, 6);
    expect(surfaces[0].rect.maxZ - surfaces[0].rect.minZ).toBeCloseTo(standDepthM, 6);
    // 통짜 박스였다면 이 폭이었다 — 회귀하면 위 단언이 이 값으로 깨진다.
    expect(monitor.widthMm / 1000).toBeGreaterThan(0.6);
  });

  it('지지면 높이는 모니터 꼭대기가 아니라 발판 상단(밑면 +14mm)이다', () => {
    expect(surfaces[0].topY).toBeCloseTo(deskTop + footTopM, 6);
    expect(surfaces[0].topY).toBeLessThan(deskTop + monitor.heightMm / 1000);
  });

  it('증상 ①: 모니터 밑 받침대가 모니터 위(+542mm)로 안 올라간다', () => {
    const riser = { minX: -0.2, maxX: 0.2, minZ: -0.125, maxZ: 0.125 };
    const seat = supportTopY(riser, deskTop, surfaces);
    expect(seat).toBeCloseTo(deskTop + footTopM, 6);
    expect(seat).toBeLessThan(deskTop + 0.1);
  });

  it('증상 ②: 규격 박스 안이지만 발판 밖인 목 옆 자리는 상판 높이 그대로다', () => {
    const mugRect = { minX: 0.21, maxX: 0.29, minZ: -0.04, maxZ: 0.04 };
    // 통짜 박스(폭 614mm = ±0.307) 안이다 — 종전 규칙이면 모니터 꼭대기로 튀던 자리.
    expect(mugRect.maxX).toBeLessThan(monitor.widthMm / 2000);
    expect(supportTopY(mugRect, deskTop, surfaces)).toBeCloseTo(deskTop, 6);
  });

  it('받침대를 먼저 놓으면 모니터가 그 위에 얹힌다 (반대 방향은 살아 있다)', () => {
    const riserTop = deskTop + 0.09;
    const riser = { rect: { minX: -0.2, maxX: 0.2, minZ: -0.125, maxZ: 0.125 }, topY: riserTop };
    const footRect = supportSurfaces(monitor, center, 0)[0].rect;
    expect(supportTopY(footRect, deskTop, [riser])).toBeCloseTo(riserTop, 6);
  });

  it('yaw 90°면 발판 rect도 같이 돈다', () => {
    const rect = supportSurfaces(monitor, center, Math.PI / 2)[0].rect;
    expect(rect.maxX - rect.minX).toBeCloseTo(standDepthM, 6);
    expect(rect.maxZ - rect.minZ).toBeCloseTo(0.2, 6);
  });
});

describe('resolveMonitorTopPose — 커서로 모니터 위에 얹는다 (DERO-591)', () => {
  const deskTop = 0.74;
  const host = {
    center: { x: 0, y: deskTop + monitor.heightMm / 2000, z: -0.2 },
    widthMm: monitor.widthMm,
    heightMm: monitor.heightMm,
    yawRad: 0,
  };
  const mug = { spec: getProduct('mug-ceramic')!, yawRad: 0 };
  const panelTopY = deskTop + monitor.heightMm / 1000;

  it('높이는 패널 상단 — 규격 박스 상단에 아이템 밑면이 닿는다', () => {
    const pose = resolveMonitorTopPose(mug, host, { x: 0.1, z: -0.2 });
    expect(pose.y - mug.spec.heightMm / 2000).toBeCloseTo(panelTopY, 9);
  });

  it('x는 커서를 따라간다', () => {
    expect(resolveMonitorTopPose(mug, host, { x: 0.12, z: 0.3 }).x).toBeCloseTo(0.12, 9);
  });

  it('z는 커서를 안 본다 — 패널(호스트 중심) 자리에 얹힌다', () => {
    expect(resolveMonitorTopPose(mug, host, { x: 0.12, z: 0.3 }).z).toBeCloseTo(host.center.z, 9);
  });

  it('폭 클램프 — 커서가 패널 밖이어도 아이템이 패널 폭 안에 남는다', () => {
    const pose = resolveMonitorTopPose(mug, host, { x: 5, z: 0 });
    expect(pose.x + mug.spec.widthMm / 2000).toBeCloseTo(monitor.widthMm / 2000, 9);
  });

  it('아이템이 패널보다 넓으면 중앙에 얹는다', () => {
    const wide = {
      spec: { widthMm: monitor.widthMm + 200, depthMm: 100, heightMm: 100 },
      yawRad: 0,
    };
    expect(resolveMonitorTopPose(wide, host, { x: 5, z: 0 }).x).toBeCloseTo(host.center.x, 9);
  });

  it('yaw 90° — 추종·클램프 축이 모니터를 따라 돈다', () => {
    const turned = { ...host, yawRad: Math.PI / 2 };
    const pose = resolveMonitorTopPose(mug, turned, { x: 0.4, z: -0.32 });
    expect(pose.x).toBeCloseTo(turned.center.x, 9);
    expect(pose.z).toBeCloseTo(turned.center.z - 0.12, 9);
  });

  it('R로 90° 돌린 아이템은 폭이 아니라 깊이로 클램프된다', () => {
    const slab = { spec: { widthMm: 200, depthMm: 400, heightMm: 60 }, yawRad: Math.PI / 2 };
    const pose = resolveMonitorTopPose(slab, host, { x: 5, z: 0 });
    // 돌아 있으므로 그 축을 먹는 반폭은 depth/2다 — 폭으로 재면 100mm 더 삐져나온다.
    expect(pose.x).toBeCloseTo(monitor.widthMm / 2000 - 0.2, 9);
  });

  describe('restsOnMonitorTop — 패널을 벗어나면 다시 앉힐 대상이다', () => {
    const hostItem = {
      spec: monitor,
      center: host.center,
      yawRad: 0,
    };
    const mugSpec = getProduct('mug-ceramic')!;
    /** 패널 상단에 얹힌 머그 — 얹기 경로가 내는 그 좌표다. */
    const seated = resolveMonitorTopPose(mug, host, { x: 0.1, z: 0.3 });

    it('패널 위 아이템은 얹힘으로 잡힌다 (지지면이 없어도)', () => {
      const rect = rotatedFootprintRect(mugSpec, seated.x, seated.z, 0);
      expect(restsOnMonitorTop({ spec: mugSpec, center: seated }, hostItem, rect)).toBe(true);
    });

    it('XZ로 패널을 벗어나면 얹힘이 아니다 — 이동 시 상판으로 다시 앉는다', () => {
      const offX = host.center.x + monitor.widthMm / 2000 + 0.3;
      const rect = rotatedFootprintRect(mugSpec, offX, seated.z, 0);
      expect(restsOnMonitorTop({ spec: mugSpec, center: { y: seated.y } }, hostItem, rect)).toBe(
        false,
      );
    });

    it('높이가 패널 상단이 아니면 얹힘이 아니다 (수동으로 띄운 아이템)', () => {
      const rect = rotatedFootprintRect(mugSpec, seated.x, seated.z, 0);
      expect(
        restsOnMonitorTop({ spec: mugSpec, center: { y: seated.y + 0.05 } }, hostItem, rect),
      ).toBe(false);
    });
  });

  it('무회귀: 얹기는 지지면 규칙을 안 건드린다 — 목 옆 자리는 여전히 상판 높이다', () => {
    const surfaces = supportSurfaces(monitor, host.center, 0);
    const mugRect = { minX: 0.21, maxX: 0.29, minZ: -0.24, maxZ: -0.16 };
    expect(supportTopY(mugRect, deskTop, surfaces)).toBeCloseTo(deskTop, 6);
  });
});

describe('supportSurfaces — 모니터암은 아무것도 내놓지 않는다 (DERO-455)', () => {
  const deskTop = 0.74;
  const arm = getProduct('monitor-arm-white')!;
  /** 뒷변에 물린 암의 규격 박스 중심. 낙차는 여기서 안 따진다 — 지지면 유무가 대상이다. */
  const armCenter = { x: 0, y: deskTop + arm.heightMm / 2000, z: -0.2 };

  it('암은 지지면 목록이 비어 있다', () => {
    expect(supportSurfaces(arm, armCenter, 0)).toHaveLength(0);
  });

  it('증상: 암과 평면상 겹치는 키보드가 암 꼭대기(+400mm)로 안 올라간다', () => {
    const surfaces = supportSurfaces(arm, armCenter, 0);
    // 암은 385mm 깊이라 뒷변에 물려도 키보드 자리까지 띠가 뻗는다 — 겹침이 전제다.
    const armRect = rotatedFootprintRect(arm, armCenter.x, armCenter.z, 0);
    const kb = { minX: -0.18, maxX: 0.18, minZ: -0.12, maxZ: 0.02 };
    expect(rectsOverlapXZ(kb, armRect)).toBe(true);
    // 통짜 박스였다면 이 값이었다: 상판 +400mm.
    expect(supportTopY(kb, deskTop, surfaces)).toBeCloseTo(deskTop, 6);
  });

  it('무회귀: 암이 없는 케이스의 스태킹은 그대로다 (매트 위 키보드)', () => {
    const mat = { rect: { minX: -0.45, maxX: 0.45, minZ: -0.1, maxZ: 0.3 }, topY: 0.744 };
    const kb = { minX: -0.18, maxX: 0.18, minZ: 0.03, maxZ: 0.17 };
    expect(supportTopY(kb, deskTop, [mat, ...supportSurfaces(arm, armCenter, 0)])).toBeCloseTo(
      0.744,
      6,
    );
  });
});

describe('clampCenterToWallsAlongEdge (F1 회귀 — 이동하면 물린 암이 상판 가운데로 밀렸다)', () => {
  // 뒷변에 물린 암: 스냅이 z를 고정하고(pinned 'z'), 좌우로 미끄러지는 x만 벽을 받는다.
  // 통짜 clampCenterToWalls를 덧걸면 아이템 전체 footprint 반깊이만큼 z가 안쪽으로
  // 밀린다 — 지지 파트만 상판 안이면 되고 머리 캔틸리버는 허용이라는 D22 규칙과
  // 정면충돌한다. placeAt과 moveItem이 같은 자리를 내야 하므로 이 함수 하나로 묶었다.
  const walls: WallPlanes = { leftX: -0.6, rightX: 0.6, frontZ: -0.4 };
  const armRect = (cx: number, cz: number) => ({
    minX: cx - 0.05,
    maxX: cx + 0.05,
    minZ: cz - 0.19,
    maxZ: cz + 0.19,
  });

  it('뒷변에 물리면 z가 스냅 값 그대로 남는다 (통짜 클램프는 안쪽으로 민다)', () => {
    const cz = -0.35; // 스냅이 고른 뒷변 좌표
    const rect = armRect(0, cz);
    expect(clampCenterToWalls(0, cz, rect, walls).z).toBeGreaterThan(cz); // 종전 동작 = 밀림
    expect(clampCenterToWallsAlongEdge(0, cz, rect, walls, 'z').z).toBeCloseTo(cz, 9);
  });

  it('변에 평행한 축은 여전히 벽 안으로 민다 (좌우로 끌어 벽 통과 금지)', () => {
    const out = clampCenterToWallsAlongEdge(0.9, -0.35, armRect(0.9, -0.35), walls, 'z');
    expect(out.x).toBeCloseTo(0.55, 9); // rightX 0.6 − 반폭 0.05
    expect(out.z).toBeCloseTo(-0.35, 9);
  });

  it('좌우 변에 물리면 고정 축이 x로 뒤바뀐다', () => {
    const cx = -0.58;
    const rect = { minX: cx - 0.19, maxX: cx + 0.19, minZ: -0.05, maxZ: 0.05 };
    expect(clampCenterToWallsAlongEdge(cx, 0, rect, walls, 'x').x).toBeCloseTo(cx, 9);
  });

  it('꺼진 벽은 어느 축도 안 민다', () => {
    const out = clampCenterToWallsAlongEdge(0.9, -0.35, armRect(0.9, -0.35), {}, 'z');
    expect(out).toEqual({ x: 0.9, z: -0.35 });
  });
});

describe('배치면 분기 (DERO-375 — 바닥 제품이 상판 위에 올라갔다)', () => {
  const deskTop = 0.74;
  // 바닥 제품 = 풋레스트(prop.mount_surface = 'FLOOR'), 상판 제품 = 그 값이 없는 규격.
  const footrest = { mountSurface: 'FLOOR' } as const;
  const onTop = { mountSurface: 'TOP' } as const;
  const noField = {}; // 목업 카탈로그·PROP이 아닌 서브타입 — 상판으로 취급한다

  describe('isFloorMounted', () => {
    it('FLOOR만 바닥이다', () => {
      expect(isFloorMounted(footrest)).toBe(true);
      expect(isFloorMounted(onTop)).toBe(false);
      expect(isFloorMounted(noField)).toBe(false);
    });

    it('벽·타공판은 바닥이 아니다 (벽은 별도 갈래, 타공판은 아직 상판)', () => {
      expect(isFloorMounted({ mountSurface: 'WALL' })).toBe(false);
      expect(isFloorMounted({ mountSurface: 'PEGBOARD' })).toBe(false);
    });
  });

  describe('baseSupportY (기준 Y는 상판이 아니라 0)', () => {
    it('바닥 제품의 기준 y는 월드 원점이다', () => {
      expect(baseSupportY(footrest, deskTop)).toBe(0);
    });

    it('책상 높이가 얼마든 바닥은 0으로 고정이다', () => {
      expect(baseSupportY(footrest, 1.2)).toBe(0);
    });

    it('상판 제품은 종전대로 상판 높이다', () => {
      expect(baseSupportY(onTop, deskTop)).toBeCloseTo(deskTop, 9);
      expect(baseSupportY(noField, deskTop)).toBeCloseTo(deskTop, 9);
    });
  });

  describe('sharesMountPlane (DERO-517 — 러그 위 의자가 항상 충돌로 잡혔다)', () => {
    it('배치면이 같으면 지지면 후보다', () => {
      expect(sharesMountPlane(footrest, footrest)).toBe(true);
      expect(sharesMountPlane(onTop, noField)).toBe(true);
    });

    it('상판↔바닥은 후보가 아니다 (375 함정 — 바닥 제품이 상판으로 올라간다)', () => {
      expect(sharesMountPlane(footrest, onTop)).toBe(false);
      expect(sharesMountPlane(onTop, footrest)).toBe(false);
    });

    it('바닥 제품은 겹친 바닥 제품 위에서 시작한다 (러그 두께 10mm)', () => {
      // resolveSupportY와 같은 합성: 배치면 필터 → supportTopY.
      const overlap = { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
      const candidates = [
        { spec: footrest, surface: { rect: overlap, topY: 0.01 } }, // 러그
        { spec: onTop, surface: { rect: overlap, topY: deskTop + 0.004 } }, // 상판 매트
      ];
      const supports = candidates
        .filter((c) => sharesMountPlane(footrest, c.spec))
        .map((c) => c.surface);
      const chair = { minX: -0.2, maxX: 0.2, minZ: -0.2, maxZ: 0.2 };
      expect(supportTopY(chair, baseSupportY(footrest, deskTop), supports)).toBeCloseTo(0.01, 6);
    });
  });

  describe('violatesDeskBoundary (바닥 제품은 상판 경계 판정에서 빠진다)', () => {
    const deskRect = { minX: -0.6, maxX: 0.6, minZ: -0.3, maxZ: 0.3 };
    // 책상 앞 바닥 — 상판 footprint 완전히 밖이다(정당한 풋레스트 자리).
    const underDesk = { minX: -0.2, maxX: 0.2, minZ: 0.5, maxZ: 0.9 };
    const insideDesk = { minX: -0.2, maxX: 0.2, minZ: -0.1, maxZ: 0.1 };

    it('상판 밖 바닥 제품은 위반이 아니다 (책상 밑이 정당한 자리)', () => {
      expect(violatesDeskBoundary(footrest, underDesk, deskRect)).toBe(false);
    });

    it('같은 자리 상판 제품은 종전대로 위반이다', () => {
      expect(violatesDeskBoundary(onTop, underDesk, deskRect)).toBe(true);
      expect(violatesDeskBoundary(noField, underDesk, deskRect)).toBe(true);
    });

    it('상판 안이면 어느 쪽도 위반이 아니다', () => {
      expect(violatesDeskBoundary(onTop, insideDesk, deskRect)).toBe(false);
      expect(violatesDeskBoundary(footrest, insideDesk, deskRect)).toBe(false);
    });

    it('지지 파트를 못 찾으면(null) 종전대로 위반 아님이다', () => {
      expect(violatesDeskBoundary(onTop, null, deskRect)).toBe(false);
      expect(violatesDeskBoundary(footrest, null, deskRect)).toBe(false);
    });

    it('타공판(PEGBOARD)은 상판을 넘어도 위반이 아니다', () => {
      const pegboard = { mountSurface: 'PEGBOARD' } as const;
      expect(violatesDeskBoundary(pegboard, underDesk, deskRect)).toBe(false);
    });

    describe('관용치 (정적 소품 2mm, 관절 에셋 0.1mm — DERO-467)', () => {
      /** 상판 오른쪽 변에서 `mm`만큼 밖으로 나간 사각형. */
      const overhang = (mm: number): RectXZ => ({
        minX: 0.2,
        maxX: deskRect.maxX + mm / 1000,
        minZ: -0.1,
        maxZ: 0.1,
      });

      it('2mm 관용치는 1.5mm 돌출을 통과시킨다', () => {
        expect(violatesDeskBoundary(onTop, overhang(1.5), deskRect, DESK_BOUNDARY_EPS_M)).toBe(
          false,
        );
      });

      it('5mm 돌출은 관용치가 있어도 위반이다', () => {
        expect(violatesDeskBoundary(onTop, overhang(5), deskRect, DESK_BOUNDARY_EPS_M)).toBe(true);
      });

      it('eps 생략(= 0)은 0.002mm 돌출도 위반이다', () => {
        expect(violatesDeskBoundary(onTop, overhang(0.002), deskRect)).toBe(true);
      });

      it('RIG_BOUNDARY_EPS_M(0.1mm)은 부동소수 노이즈(0.01mm 돌출)를 통과시킨다', () => {
        expect(violatesDeskBoundary(onTop, overhang(0.01), deskRect, RIG_BOUNDARY_EPS_M)).toBe(
          false,
        );
      });

      it('RIG_BOUNDARY_EPS_M은 1mm 돌출(진짜 물림 실패)은 여전히 위반이다', () => {
        expect(violatesDeskBoundary(onTop, overhang(1), deskRect, RIG_BOUNDARY_EPS_M)).toBe(true);
      });
    });

    describe('clampAlongEdgeToDesk — 엣지 락 암의 변-방향 상판 코너 클램프 (DERO-467)', () => {
      it('지지 박스가 상판 안이면 좌표를 건드리지 않는다', () => {
        expect(clampAlongEdgeToDesk(0, -0.05, 0.05, 0.6)).toBe(0);
      });

      it('코너를 넘으면 지지 박스가 변 끝에 닿는 좌표로 민다', () => {
        expect(clampAlongEdgeToDesk(0.7, -0.05, 0.05, 0.6)).toBeCloseTo(0.55, 10);
        expect(clampAlongEdgeToDesk(-0.7, -0.05, 0.05, 0.6)).toBeCloseTo(-0.55, 10);
      });

      it('비대칭 extents는 튀어나온 쪽 기준으로 클램프된다', () => {
        expect(clampAlongEdgeToDesk(-0.7, -0.02, 0.06, 0.6)).toBeCloseTo(-0.58, 10);
        // 거울 비대칭이면 반대 코너의 한계가 달라진다 — 변마다 부호 매핑이 필요한 이유.
        expect(clampAlongEdgeToDesk(0.7, -0.06, 0.02, 0.6)).toBeCloseTo(0.58, 10);
      });

      it('지지 박스가 상판보다 넓으면(구간 역전) 중앙 정렬한다', () => {
        expect(clampAlongEdgeToDesk(0.4, -0.7, 0.7, 0.6)).toBeCloseTo(0, 10);
        expect(clampAlongEdgeToDesk(0.4, -0.8, 0.6, 0.6)).toBeCloseTo(0.1, 10);
      });

      it('정확히 한계 좌표는 그대로 둔다 (f64 노이즈 내에서)', () => {
        expect(clampAlongEdgeToDesk(0.55, -0.05, 0.05, 0.6)).toBeCloseTo(0.55, 10);
      });
    });
  });
});

describe('벽 배치 (DERO-375 — WALL 제품이 상판 위에 올라갔다)', () => {
  // 벽걸이 선반 규격: 폭 900 × 깊이 200 × 높이 250 (mm).
  const shelf = { widthMm: 900, depthMm: 200, heightMm: 250, mountSurface: 'WALL' } as const;
  const onTop = { mountSurface: 'TOP' } as const;
  // 기본 벽 배치 — 좌 x=-1.55, 우 x=+1.55, 전면 z=-0.3(책상 깊이 600mm).
  const planes: WallPlanes = { leftX: -1.55, rightX: 1.55, frontZ: -0.3 };
  const eye = 1.2; // 벽면 히트 높이 (m)

  describe('배치면 판별', () => {
    it('WALL만 벽 제품이다 (PEGBOARD는 타공판 그리드가 따로 필요해 범위 밖)', () => {
      expect(isWallMounted({ mountSurface: 'WALL' })).toBe(true);
      expect(isWallMounted({ mountSurface: 'PEGBOARD' })).toBe(false);
      expect(isWallMounted({ mountSurface: 'FLOOR' })).toBe(false);
      expect(isWallMounted({})).toBe(false);
    });

    it('바닥·벽 제품은 상판 스냅(스태킹·요람)을 안 탄다', () => {
      expect(usesDeskSnap({ mountSurface: 'WALL' })).toBe(false);
      expect(usesDeskSnap({ mountSurface: 'FLOOR' })).toBe(false);
      expect(usesDeskSnap({ mountSurface: 'TOP' })).toBe(true);
      expect(usesDeskSnap({ mountSurface: 'PEGBOARD' })).toBe(true);
      expect(usesDeskSnap({})).toBe(true);
    });

    it('벽 제품은 상판 경계 판정에서 빠진다 (상판 밖이 정당한 자리)', () => {
      const deskRect = { minX: -0.6, maxX: 0.6, minZ: -0.3, maxZ: 0.3 };
      const onWall = { minX: -1.55, maxX: -1.35, minZ: -0.45, maxZ: 0.45 };
      expect(violatesDeskBoundary(shelf, onWall, deskRect)).toBe(false);
      expect(violatesDeskBoundary(onTop, onWall, deskRect)).toBe(true);
    });
  });

  describe('자세 — 뒷면이 벽에 밀착하고 앞면이 방을 본다', () => {
    it('세 벽의 고정 yaw', () => {
      expect(WALL_YAW_DEG.left).toBe(90);
      expect(WALL_YAW_DEG.front).toBe(0);
      expect(WALL_YAW_DEG.right).toBe(270);
    });

    it('앞면(로컬 +Z)이 그 벽의 내향 법선을 본다', () => {
      // three의 Y 회전은 로컬 +Z를 (sin y, 0, cos y)로 보낸다.
      const facing = (deg: number) => {
        const r = (deg * Math.PI) / 180;
        return [Math.sin(r), Math.cos(r)];
      };
      const [lx, lz] = facing(WALL_YAW_DEG.left);
      expect(lx).toBeCloseTo(1, 9); // 좌 벽 내향 = +X
      expect(lz).toBeCloseTo(0, 9);
      const [fx, fz] = facing(WALL_YAW_DEG.front);
      expect(fx).toBeCloseTo(0, 9);
      expect(fz).toBeCloseTo(1, 9); // 전면 벽 내향 = +Z
      const [rx, rz] = facing(WALL_YAW_DEG.right);
      expect(rx).toBeCloseTo(-1, 9); // 우 벽 내향 = -X
      expect(rz).toBeCloseTo(0, 9);
    });

    it('벽 법선 축은 좌·우가 x, 전면이 z다', () => {
      expect(wallNormalAxis('left')).toBe('x');
      expect(wallNormalAxis('right')).toBe('x');
      expect(wallNormalAxis('front')).toBe('z');
    });
  });

  describe('벽 이격 — 중심은 벽면에서 규격 depth의 절반', () => {
    it('좌 벽: 중심 x = 벽면 + depth/2, z는 히트 그대로', () => {
      const pose = resolveWallPose(shelf, 'left', -1.55, { x: 0, y: eye, z: 0.2 }, planes);
      expect(pose.x).toBeCloseTo(-1.55 + 0.1, 9);
      expect(pose.z).toBeCloseTo(0.2, 9);
      expect(pose.yawDeg).toBe(90);
    });

    it('우 벽: 중심 x = 벽면 − depth/2', () => {
      // z는 전면 벽 클램프에 안 걸리는 자리로 잡는다(폭 900mm의 반폭 0.45 > frontZ 여유).
      const pose = resolveWallPose(shelf, 'right', 1.55, { x: 0, y: eye, z: 0.4 }, planes);
      expect(pose.x).toBeCloseTo(1.55 - 0.1, 9);
      expect(pose.z).toBeCloseTo(0.4, 9);
      expect(pose.yawDeg).toBe(270);
    });

    it('전면 벽: 중심 z = 벽면 + depth/2, x는 히트 그대로', () => {
      const pose = resolveWallPose(shelf, 'front', -0.3, { x: 0.25, y: eye, z: 0 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + 0.1, 9);
      expect(pose.x).toBeCloseTo(0.25, 9);
      expect(pose.yawDeg).toBe(0);
    });

    it('벽이 움직여도 이격은 규격 depth 절반 그대로다 (벽 거리 조절)', () => {
      const pose = resolveWallPose(shelf, 'left', -0.9, { x: 0, y: eye, z: 0 }, planes);
      expect(pose.x).toBeCloseTo(-0.9 + 0.1, 9);
    });

    it('히트의 벽 법선 성분은 무시한다 — 벽면 좌표가 정본이다', () => {
      // 레이 히트가 부동소수로 벽면에서 살짝 벗어나도 중심은 벽면 기준으로 다시 잡힌다.
      const pose = resolveWallPose(shelf, 'left', -1.55, { x: 0.7, y: eye, z: 0 }, planes);
      expect(pose.x).toBeCloseTo(-1.45, 9);
    });
  });

  describe('테마 장식 깊이 보정 — 얇은 벽걸이가 슬랫 뒤로 숨지 않는다 (2026-08-06)', () => {
    // shelf(depth 200mm)는 어떤 슬랫보다 두꺼우니 원래 공식(depth/2)이 그대로 유지돼야 하고,
    // thin(depth 10mm)은 오크 웜 슬랫(14mm)보다 얇으니 앞면이 슬랫 밖으로 나오게 밀려야 한다.
    const thin = { widthMm: 400, depthMm: 10, heightMm: 300, mountSurface: 'WALL' } as const;
    const OAK_SLAT_M = 0.014; // finishes/woodSlat SLAT_D와 같은 값

    it('decorDepthM을 안 넘기면(기본 0) 장식 없는 벽과 똑같다', () => {
      const pose = resolveWallPose(shelf, 'front', -0.3, { x: 0, y: eye, z: 0 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + 0.1, 9);
    });

    it('장식보다 두꺼운 제품은 decorDepthM을 줘도 이격이 안 바뀐다', () => {
      const pose = resolveWallPose(
        shelf,
        'front',
        -0.3,
        { x: 0, y: eye, z: 0 },
        planes,
        WALL_HEIGHT_M,
        OAK_SLAT_M,
      );
      expect(pose.z).toBeCloseTo(-0.3 + 0.1, 9); // depth/2 그대로 — 슬랫 여유가 이미 남는다
    });

    it('장식보다 얇은 제품은 앞면이 장식 밖으로 최소 여유만큼 나오게 밀린다', () => {
      const pose = resolveWallPose(
        thin,
        'front',
        -0.3,
        { x: 0, y: eye, z: 0 },
        planes,
        WALL_HEIGHT_M,
        OAK_SLAT_M,
      );
      // frontFace = max(depth, decor+reveal) = max(0.01, 0.014+0.005) = 0.019
      // offset = frontFace - depth/2 = 0.019 - 0.005 = 0.014
      expect(pose.z).toBeCloseTo(-0.3 + 0.014, 9);
    });

    it('같은 얇은 제품도 장식 없는 벽(decorDepthM 생략)이면 원래 공식 그대로다', () => {
      const pose = resolveWallPose(thin, 'front', -0.3, { x: 0, y: eye, z: 0 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + 0.005, 9); // depth/2 = 0.005
    });
  });

  describe('타공판은 장식 유무와 무관하게 항상 스탠드오프로 띄운다 (2026-08-06 2차 요청)', () => {
    const pegboardById = {
      widthMm: 600,
      depthMm: 15,
      heightMm: 900,
      mountSurface: 'WALL',
      categoryId: 69,
    } as const;
    const pegboardByName = {
      widthMm: 600,
      depthMm: 15,
      heightMm: 900,
      mountSurface: 'WALL',
      categoryName: '타공판',
    } as const;
    const OAK_SLAT_M = 0.014;

    it('장식 없는 벽(기본·다크 스튜디오)에서도 25mm 스탠드오프로 띄운다', () => {
      const pose = resolveWallPose(pegboardById, 'front', -0.3, { x: 0, y: eye, z: 0 }, planes);
      // frontFace = max(depth, 0 + 0.025) = 0.025, offset = 0.025 - depth/2 = 0.025 - 0.0075
      expect(pose.z).toBeCloseTo(-0.3 + (0.025 - 0.0075), 9);
    });

    it('장식 있는 벽(오크 웜 등)에서는 장식 위로 25mm 더 띄운다', () => {
      const pose = resolveWallPose(
        pegboardById,
        'front',
        -0.3,
        { x: 0, y: eye, z: 0 },
        planes,
        WALL_HEIGHT_M,
        OAK_SLAT_M,
      );
      // frontFace = max(depth, 0.014 + 0.025) = 0.039, offset = 0.039 - 0.0075
      expect(pose.z).toBeCloseTo(-0.3 + (0.039 - 0.0075), 9);
    });

    it('categoryId가 없어도 categoryName "타공판"이면 같은 규칙을 탄다', () => {
      const pose = resolveWallPose(pegboardByName, 'front', -0.3, { x: 0, y: eye, z: 0 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + (0.025 - 0.0075), 9);
    });

    it('타공판이 아닌 제품(shelf)은 장식 없는 벽에서 스탠드오프를 안 탄다', () => {
      const pose = resolveWallPose(shelf, 'front', -0.3, { x: 0, y: eye, z: 0 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + 0.1, 9); // depth/2 그대로 — 위 첫 테스트와 동일
    });
  });

  describe('수직 클램프 — 바닥 아래·벽 위로 못 나간다', () => {
    it('바닥 아래로 내리면 바닥에 닿는 높이로 올라온다', () => {
      expect(clampWallCenterY(shelf, -0.5)).toBeCloseTo(0.125, 9);
      expect(clampWallCenterY(shelf, 0)).toBeCloseTo(0.125, 9);
    });

    it('벽 높이 위로 올리면 천장에 닿는 높이로 내려온다', () => {
      expect(clampWallCenterY(shelf, 9)).toBeCloseTo(WALL_HEIGHT_M - 0.125, 9);
    });

    it('범위 안이면 히트 높이 그대로다 (y는 사용자가 정하는 값)', () => {
      expect(clampWallCenterY(shelf, 1.4)).toBeCloseTo(1.4, 9);
    });

    it('벽보다 큰 아이템은 클램프 구간이 없어 벽 한가운데로 고정된다', () => {
      expect(clampWallCenterY({ heightMm: 3000 }, 0.2)).toBeCloseTo(WALL_HEIGHT_M / 2, 9);
    });

    it('resolveWallPose가 같은 클램프를 건다', () => {
      const low = resolveWallPose(shelf, 'front', -0.3, { x: 0, y: -1, z: 0 }, planes);
      expect(low.y).toBeCloseTo(0.125, 9);
      const high = resolveWallPose(shelf, 'front', -0.3, { x: 0, y: 5, z: 0 }, planes);
      expect(high.y).toBeCloseTo(WALL_HEIGHT_M - 0.125, 9);
    });
  });

  describe('수평 클램프 — 벽 법선 축은 절대 안 움직인다', () => {
    it('전면 벽 아이템을 좌 벽 밖으로 끌면 x만 밀리고 z는 벽에 붙어 있다', () => {
      // yaw 0이라 x 반폭은 폭의 절반(0.45) — 좌 벽 -1.55에서 -1.1까지 들어와야 한다.
      const pose = resolveWallPose(shelf, 'front', -0.3, { x: -3, y: eye, z: 0 }, planes);
      expect(pose.x).toBeCloseTo(-1.55 + 0.45, 9);
      expect(pose.z).toBeCloseTo(-0.2, 9); // 벽 이격 유지
    });

    it('좌 벽 아이템을 전면 벽 밖으로 끌면 z만 밀리고 x는 벽에 붙어 있다', () => {
      // yaw 90이라 z 반폭이 폭의 절반(0.45) — 전면 벽 -0.3에서 0.15까지 들어와야 한다.
      const pose = resolveWallPose(shelf, 'left', -1.55, { x: 0, y: eye, z: -5 }, planes);
      expect(pose.z).toBeCloseTo(-0.3 + 0.45, 9);
      expect(pose.x).toBeCloseTo(-1.45, 9); // 벽 이격 유지 — 통짜 클램프면 여기가 밀린다
    });

    it('꺼진 벽은 제약이 없다 (우 벽 OFF 기본값)', () => {
      const pose = resolveWallPose(shelf, 'front', -0.3, { x: 3, y: eye, z: 0 }, { frontZ: -0.3 });
      expect(pose.x).toBeCloseTo(3, 9);
    });
  });
});

// --- 타공판 부착 (DERO-518) --------------------------------------------
// 벽 부착과 갈리는 축은 기준면 하나다 — 벽 평면이 아니라 **호스트 아이템의 앞면**이다.
// 그래서 이 블록의 기대값은 전부 "호스트 앞면 + 내 반깊이"에서 나온다.
describe('타공판 부착 (resolvePegboardPose · resolveHookHangPose)', () => {
  /** 전면 벽(z=-0.3)에 25mm 스탠드오프로 붙은 타공판 패널의 규격 박스. */
  const panelFront = {
    center: { x: 0, y: 1.2, z: -0.3 + (0.025 - 0.0075) },
    widthMm: 600,
    depthMm: 15,
    heightMm: 600,
  };
  /** 패널 앞면 = 중심 + 깊이/2 (전면 벽은 내향 법선이 +z). */
  const panelFrontFace = panelFront.center.z + 0.0075;
  const hook = { widthMm: 30, depthMm: 45, heightMm: 60 } as const;
  const clock = { widthMm: 300, depthMm: 42, heightMm: 300 } as const;

  it('PEGBOARD만 타공판 부착 제품이다 (WALL·FLOOR·TOP은 아니다)', () => {
    expect(isPegboardMounted({ mountSurface: 'PEGBOARD' })).toBe(true);
    expect(isPegboardMounted({ mountSurface: 'WALL' })).toBe(false);
    expect(isPegboardMounted({ mountSurface: 'FLOOR' })).toBe(false);
    expect(isPegboardMounted({})).toBe(false);
  });

  it('벽면을 따라가는 축은 벽 법선 축의 반대다', () => {
    expect(wallAlongAxis('front')).toBe('x');
    expect(wallNormalAxis('front')).toBe('z');
    expect(wallAlongAxis('left')).toBe('z');
    expect(wallNormalAxis('left')).toBe('x');
  });

  it('후크 뒷면이 패널 앞면에 붙고 yaw는 벽 면에 종속된다', () => {
    const pose = resolvePegboardPose(hook, 'front', panelFront, { x: 0.1, y: 1.3, z: 0 });
    expect(pose.z).toBeCloseTo(panelFrontFace + 0.0225, 9); // 앞면 + 깊이/2
    expect(pose.x).toBeCloseTo(0.1, 9); // 벽면 축은 짚은 자리 그대로
    expect(pose.y).toBeCloseTo(1.3, 9); // 높이도 짚은 자리 — 지지면이 없다
    expect(pose.yawDeg).toBe(WALL_YAW_DEG.front);
  });

  it('패널 밖을 짚으면 판 경계 안으로 민다 (두 축 다) — 안 그러면 판 옆 허공에 붙는다', () => {
    const pose = resolvePegboardPose(hook, 'front', panelFront, { x: 5, y: 5, z: 0 });
    expect(pose.x).toBeCloseTo(0.3 - 0.015, 9); // 판 반폭 - 후크 반폭
    expect(pose.y).toBeCloseTo(1.2 + 0.3 - 0.03, 9); // 판 상단 - 후크 반높이
  });

  it('아이템이 패널보다 크면 클램프 구간이 없어 중앙 정렬된다', () => {
    const huge = { widthMm: 900, depthMm: 40, heightMm: 900 } as const;
    const pose = resolvePegboardPose(huge, 'front', panelFront, { x: 5, y: 5, z: 0 });
    expect(pose.x).toBeCloseTo(panelFront.center.x, 9);
    expect(pose.y).toBeCloseTo(panelFront.center.y, 9);
  });

  it('좌 벽 패널은 법선이 x, 벽면 축이 z다', () => {
    const panelLeft = {
      center: { x: -1.55 + (0.025 - 0.0075), y: 1.2, z: 0 },
      widthMm: 600,
      depthMm: 15,
      heightMm: 600,
    };
    const pose = resolvePegboardPose(hook, 'left', panelLeft, { x: 0, y: 1.2, z: 0.2 });
    expect(pose.x).toBeCloseTo(panelLeft.center.x + 0.0075 + 0.0225, 9);
    expect(pose.z).toBeCloseTo(0.2, 9);
    expect(pose.yawDeg).toBe(WALL_YAW_DEG.left);
  });

  it('우 벽 패널은 내향 법선이 -x라 부호가 뒤집힌다', () => {
    const panelRight = {
      center: { x: 1.55 - (0.025 - 0.0075), y: 1.2, z: 0 },
      widthMm: 600,
      depthMm: 15,
      heightMm: 600,
    };
    const pose = resolvePegboardPose(hook, 'right', panelRight, { x: 0, y: 1.2, z: 0.2 });
    expect(pose.x).toBeCloseTo(panelRight.center.x - 0.0075 - 0.0225, 9);
    expect(pose.yawDeg).toBe(WALL_YAW_DEG.right);
  });

  describe('후크에 건다 — 자리가 후크에 고정된다', () => {
    /** 위 첫 테스트가 낸 자리에 붙은 후크. */
    const placedHook = {
      center: { x: 0.1, y: 1.3, z: panelFrontFace + 0.0225 },
      ...hook,
    };

    it('아이템 상단이 후크 상단에 맞물린다 (걸이의 정의)', () => {
      const pose = resolveHookHangPose(clock, 'front', placedHook);
      const hookTop = placedHook.center.y + 0.03;
      expect(pose.y + 0.15).toBeCloseTo(hookTop, 9); // 시계 상단 == 후크 상단
    });

    it('벽면 축은 짚은 자리가 아니라 후크 중심이다', () => {
      const pose = resolveHookHangPose(clock, 'front', placedHook);
      expect(pose.x).toBeCloseTo(placedHook.center.x, 9);
    });

    it('체인이 한 칸 더 앞으로 나간다 — 판 < 후크 < 걸린 제품 순', () => {
      const pose = resolveHookHangPose(clock, 'front', placedHook);
      const hookFront = placedHook.center.z + 0.0225;
      expect(pose.z).toBeCloseTo(hookFront + 0.021, 9);
      // 전면 벽은 내향이 +z라 앞으로 갈수록 z가 커진다
      expect(pose.z).toBeGreaterThan(placedHook.center.z);
      expect(placedHook.center.z).toBeGreaterThan(panelFront.center.z);
    });

    it('우 벽에서도 같은 순서다 (부호만 뒤집힌다)', () => {
      const hookRight = { center: { x: 1.4, y: 1.2, z: 0 }, ...hook };
      const pose = resolveHookHangPose(clock, 'right', hookRight);
      expect(pose.x).toBeCloseTo(1.4 - 0.0225 - 0.021, 9);
      expect(pose.x).toBeLessThan(hookRight.center.x);
    });
  });
});
