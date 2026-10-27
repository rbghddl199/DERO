// 창문 개구부 계약(DERO-511, ADR-0030 결정 5·6·7) — 구멍 뚫린 벽 raycast 회피가 핵심이다
import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  WINDOW_SILL_MM,
  WINDOW_SIZES,
  buildWallGeometry,
  evictAlongCandidates,
  evictAlongFromWindow,
  primaryWindowSide,
  slotCenterXMm,
  windowAtSlot,
  windowConfigForSlot,
  windowRectM,
  windowSlotOf,
  windowSizeOf,
  windowWithSize,
  type WindowSizeKey,
  type WindowSlotKey,
} from '../src/three/core/window';
import { WALL_HEIGHT_M } from '../src/three/core/snap';

// 씬과 같은 값(scene.ts) — 전면 벽 폭 6.2m, 벽 높이 2.6m.
const FRONT_W = 6.2;

/** 씬의 전면 벽처럼 세운 메쉬 — 중심 (0, h/2, planeZ), 법선 +z. */
function frontWallMesh(hole: ReturnType<typeof windowRectM> | null, planeZ = -0.4): THREE.Mesh {
  const mesh = new THREE.Mesh(buildWallGeometry(FRONT_W, WALL_HEIGHT_M, hole));
  mesh.position.set(0, WALL_HEIGHT_M / 2, planeZ);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** 방 안에서 벽 위의 점 (x, y)를 향해 쏜다 — pickWall과 같은 기하다. */
function hitsFrontWall(mesh: THREE.Mesh, x: number, y: number): boolean {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
  return ray.intersectObject(mesh, false).length > 0;
}

describe('구멍 뚫린 벽 raycast 회피 (ADR-0030 결정 5의 계약)', () => {
  const win = windowConfigForSlot('front', 'CENTER', 'STANDARD'); // 중앙 1200×1400, 창턱 900
  const rect = windowRectM(win, FRONT_W, WALL_HEIGHT_M);
  const mesh = frontWallMesh(rect);

  it('창문 사각형 안을 향한 광선은 벽을 통과한다 — 여러 지점', () => {
    // 중심·네 귀퉁이 안쪽(경계에서 5cm 안) 전부 통과해야 한다.
    expect(hitsFrontWall(mesh, 0, 1.6)).toBe(false);
    expect(hitsFrontWall(mesh, rect.alongMinM + 0.05, rect.yMinM + 0.05)).toBe(false);
    expect(hitsFrontWall(mesh, rect.alongMaxM - 0.05, rect.yMaxM - 0.05)).toBe(false);
    expect(hitsFrontWall(mesh, rect.alongMinM + 0.05, rect.yMaxM - 0.05)).toBe(false);
    expect(hitsFrontWall(mesh, rect.alongMaxM - 0.05, rect.yMinM + 0.05)).toBe(false);
  });

  it('경계 바로 밖은 정상적으로 맞는다', () => {
    expect(hitsFrontWall(mesh, rect.alongMinM - 0.02, 1.6)).toBe(true);
    expect(hitsFrontWall(mesh, rect.alongMaxM + 0.02, 1.6)).toBe(true);
    expect(hitsFrontWall(mesh, 0, rect.yMinM - 0.02)).toBe(true); // 창턱 아래
    expect(hitsFrontWall(mesh, 0, rect.yMaxM + 0.02)).toBe(true); // 상인방 위
  });

  it('창문 없는 면은 어디나 맞는다', () => {
    const solid = frontWallMesh(null);
    expect(hitsFrontWall(solid, 0, 1.6)).toBe(true);
    expect(hitsFrontWall(solid, 0.5, 1.0)).toBe(true);
  });

  it('크기·슬롯 조합마다 그 자리에 구멍이 있다', () => {
    for (const slot of ['LEFT', 'CENTER', 'RIGHT'] as WindowSlotKey[]) {
      for (const size of ['STANDARD', 'WIDE'] as WindowSizeKey[]) {
        const w = windowConfigForSlot('front', slot, size);
        const r = windowRectM(w, FRONT_W, WALL_HEIGHT_M);
        const m = frontWallMesh(r);
        const cx = (r.alongMinM + r.alongMaxM) / 2;
        expect(hitsFrontWall(m, cx, 1.6), `${slot}/${size} 중심`).toBe(false);
        expect(hitsFrontWall(m, r.alongMaxM + 0.02, 1.6), `${slot}/${size} 경계 밖`).toBe(true);
      }
    }
  });

  it('회전한 측면 벽에서도 구멍이 로컬 x를 따라간다 — 씬의 좌 벽과 같은 자세', () => {
    // 좌 벽: rotation.y = +90°, 로컬 +x → 월드 -z. 슬롯 기준점 -800mm는 월드 z = +0.8.
    const leftWin = windowConfigForSlot('left', 'CENTER', 'STANDARD');
    const r = windowRectM(leftWin, 5.5, WALL_HEIGHT_M);
    const mesh = new THREE.Mesh(buildWallGeometry(5.5, WALL_HEIGHT_M, r));
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(-1.55, WALL_HEIGHT_M / 2, 0);
    mesh.updateMatrixWorld(true);
    const shoot = (z: number, y: number): boolean =>
      new THREE.Raycaster(new THREE.Vector3(1, y, z), new THREE.Vector3(-1, 0, 0)).intersectObject(
        mesh,
        false,
      ).length > 0;
    expect(shoot(0.8, 1.6)).toBe(false); // 구멍 중심(월드 z = -로컬 x)
    expect(shoot(0.8 + 0.7, 1.6)).toBe(true); // 구멍 밖(표준 반폭 0.6 + 0.1)
  });
});

describe('창문 슬롯 → mm 변환 (ADR-0030 결정 6)', () => {
  it('창턱 900mm 고정 — 크기와 무관하게 하단이 창턱이다', () => {
    for (const size of ['STANDARD', 'WIDE'] as WindowSizeKey[]) {
      const w = windowConfigForSlot('front', 'CENTER', size);
      expect(w.centerYMm - w.heightMm / 2).toBe(WINDOW_SILL_MM);
    }
  });

  it('크기 2종의 mm가 결정값이다', () => {
    expect(WINDOW_SIZES.STANDARD).toEqual({ widthMm: 1200, heightMm: 1400 });
    expect(WINDOW_SIZES.WIDE).toEqual({ widthMm: 1800, heightMm: 1400 });
  });

  it('슬롯 좌·중·우가 서로 다른 수평 위치이고, 역산이 왕복한다', () => {
    const xs = (['LEFT', 'CENTER', 'RIGHT'] as WindowSlotKey[]).map((slot) => {
      const w = windowConfigForSlot('front', slot, 'STANDARD');
      expect(windowSlotOf('front', w)).toBe(slot);
      expect(windowSizeOf(w)).toBe('STANDARD');
      return w.centerXMm;
    });
    expect(new Set(xs).size).toBe(3);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('슬롯 밖 자유 mm는 슬롯이 아니라고 답한다 — UI는 존재만 표시한다', () => {
    expect(
      windowSlotOf('front', { centerXMm: 123, centerYMm: 1600, widthMm: 1200, heightMm: 1400 }),
    ).toBeNull();
    expect(
      windowSizeOf({ centerXMm: 0, centerYMm: 1600, widthMm: 999, heightMm: 1400 }),
    ).toBeNull();
  });

  it('벽 폭보다 넓은 창은 벽 안으로 클램프된다', () => {
    const r = windowRectM(
      { centerXMm: 0, centerYMm: 1600, widthMm: 99_000, heightMm: 99_000 },
      FRONT_W,
      WALL_HEIGHT_M,
    );
    expect(r.alongMinM).toBeGreaterThanOrEqual(-FRONT_W / 2);
    expect(r.alongMaxM).toBeLessThanOrEqual(FRONT_W / 2);
    expect(r.yMinM).toBeGreaterThanOrEqual(0);
    expect(r.yMaxM).toBeLessThanOrEqual(WALL_HEIGHT_M);
  });

  it('벽 밖으로 치우친 중심은 안쪽으로 밀린다', () => {
    const r = windowRectM(
      { centerXMm: 99_000, centerYMm: 1600, widthMm: 1200, heightMm: 1400 },
      FRONT_W,
      WALL_HEIGHT_M,
    );
    expect(r.alongMaxM).toBeLessThanOrEqual(FRONT_W / 2);
    expect(r.alongMaxM - r.alongMinM).toBeCloseTo(1.2, 6);
  });
});

describe('주 창문 선정 (ADR-0030 결정 7)', () => {
  const on = { left: true, front: true, right: true };

  it('우선순위는 전면 > 좌 > 우다', () => {
    expect(primaryWindowSide({ left: true, front: true, right: true }, on)).toBe('front');
    expect(primaryWindowSide({ left: true, front: false, right: true }, on)).toBe('left');
    expect(primaryWindowSide({ left: false, front: false, right: true }, on)).toBe('right');
  });

  it('꺼진 벽의 창문은 후보가 아니다', () => {
    expect(
      primaryWindowSide(
        { left: true, front: true, right: false },
        { left: true, front: false, right: true },
      ),
    ).toBe('left');
  });

  it('후보가 없으면 null — 햇살 세기 0의 근거다', () => {
    expect(primaryWindowSide({ left: false, front: false, right: false }, on)).toBeNull();
    expect(
      primaryWindowSide(
        { left: true, front: true, right: true },
        { left: false, front: false, right: false },
      ),
    ).toBeNull();
  });
});

describe('창문 자리 벽걸이 퇴거', () => {
  const rect = { alongMinM: -0.6, alongMaxM: 0.6, yMinM: 0.9, yMaxM: 2.3 };
  const HALF = 0.3; // 600mm 아이템 반폭

  it('중심이 창문 안이면 가까운 수평 모서리 밖으로 몸 전체가 빠지게 민다', () => {
    const left = evictAlongFromWindow(-0.3, HALF, 1.6, rect);
    expect(left).not.toBeNull();
    expect(left! + HALF).toBeLessThan(rect.alongMinM); // 오른쪽 끝까지 창문 밖
    const right = evictAlongFromWindow(0.4, HALF, 1.6, rect);
    expect(right! - HALF).toBeGreaterThan(rect.alongMaxM);
  });

  it('중심이 창문 밖이면 그대로 둔다 — 수평이든 수직이든', () => {
    expect(evictAlongFromWindow(0.8, HALF, 1.6, rect)).toBeNull(); // 수평 밖
    expect(evictAlongFromWindow(0, HALF, 0.7, rect)).toBeNull(); // 창턱 아래(책상 높이 선반)
    expect(evictAlongFromWindow(0, HALF, 2.4, rect)).toBeNull(); // 상인방 위
  });

  it('후보는 [가까운 쪽, 반대쪽] 순이다 — 코너 클램프가 첫 후보를 되밀면 반대쪽을 쓴다', () => {
    const cands = evictAlongCandidates(-0.3, HALF, 1.6, rect)!;
    expect(cands[0]).toBeLessThan(rect.alongMinM); // 가까운 왼쪽 밖
    expect(cands[1]).toBeGreaterThan(rect.alongMaxM); // 반대쪽 오른쪽 밖
    expect(evictAlongCandidates(0.8, HALF, 1.6, rect)).toBeNull();
  });
});

describe('창문 편집은 한 축씩만 바꾼다 — 자유 mm 창문의 기하를 클릭이 지우면 안 된다', () => {
  const FREE = { centerXMm: 123, centerYMm: 1700, widthMm: 990, heightMm: 1000 };

  it('슬롯 클릭은 수평 위치만 바꾸고 크기·창턱을 보존한다', () => {
    const moved = windowAtSlot('front', 'RIGHT', FREE);
    expect(moved.centerXMm).toBe(slotCenterXMm('front', 'RIGHT'));
    expect(moved.widthMm).toBe(990);
    expect(moved.heightMm).toBe(1000);
    expect(moved.centerYMm).toBe(1700);
  });

  it('창문이 없던 면의 슬롯 클릭은 표준 크기로 새로 낸다', () => {
    expect(windowAtSlot('front', 'CENTER', null)).toEqual(
      windowConfigForSlot('front', 'CENTER', 'STANDARD'),
    );
  });

  it('크기 클릭은 크기만 바꾸고 수평 위치·창턱(하단)을 보존한다', () => {
    const resized = windowWithSize(FREE, 'WIDE');
    expect(resized.centerXMm).toBe(123);
    expect(resized.widthMm).toBe(1800);
    expect(resized.heightMm).toBe(1400);
    // 하단(창턱) 보존: 1700 - 500 = 1200 유지 → 새 중심 1200 + 700
    expect(resized.centerYMm - resized.heightMm / 2).toBe(1200);
  });

  it('슬롯 창문에서는 종전 동작과 동일하다 — 슬롯·크기 왕복이 유지된다', () => {
    const std = windowConfigForSlot('left', 'LEFT', 'STANDARD');
    expect(windowWithSize(std, 'WIDE')).toEqual(windowConfigForSlot('left', 'LEFT', 'WIDE'));
    expect(windowAtSlot('left', 'RIGHT', std)).toEqual(
      windowConfigForSlot('left', 'RIGHT', 'STANDARD'),
    );
  });
});
