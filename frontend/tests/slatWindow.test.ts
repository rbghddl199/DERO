// 우드 슬랫이 창문 개구부를 덮지 않는가 — 계열 부조 × 창문 계약 (2026-08-10)
import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { buildSlats } from '../src/three/finishes/parts';
import type { FinishContext } from '../src/three/finishes/types';
import type { WindowRectM } from '../src/three/core/window';

const WALL_H = 2.4;
const CTX: FinishContext = {
  wallHeightM: WALL_H,
  wallWidthM: { left: 2.4, front: 3.0, right: 2.4 },
  wallPlaneCoord: { left: -1.5, front: -0.35, right: 1.5 },
  groundSizeM: 12,
  windowRectM: { left: null, front: null, right: null },
};

// 표준 창(창턱 900mm · 높이 1400mm · 폭 1800mm)을 벽 중앙에.
const WINDOW: WindowRectM = { alongMinM: -0.9, alongMaxM: 0.9, yMinM: 0.9, yMaxM: 2.3 };

const OPTIONS = {
  pitchM: 0.048,
  widthM: 0.036,
  depthM: 0.014,
  bottomY: 0.09,
  topY: WALL_H,
};

const material = (): THREE.Material => new THREE.MeshStandardNodeMaterial();

/** 접힌(스케일 0) 인스턴스인가 — **`Matrix4.decompose`로 판정하면 안 된다**: 3×3이 전부 0인
 *  행렬에도 스케일 `1,1,1`을 돌려준다(three r185 실측). 열 길이를 직접 읽는다. */
function folded(matrix: THREE.Matrix4): boolean {
  const [a, b, c] = matrix.elements;
  return a * a + b * b + c * c === 0;
}

/** 실제로 그려지는 판재의 월드 박스만 — 접은 자리는 뺀다. */
function drawnBoxes(group: THREE.Group): THREE.Box3[] {
  const boxes: THREE.Box3[] = [];
  const matrix = new THREE.Matrix4();
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      if (folded(matrix)) continue;
      const box = new THREE.Box3()
        .setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute)
        .applyMatrix4(matrix)
        .applyMatrix4(mesh.matrixWorld);
      boxes.push(box);
    }
  });
  return boxes;
}

describe('우드 슬랫은 창문 개구부를 덮지 않는다', () => {
  it('창문이 없으면 판재가 벽을 통짜로 덮는다 (종전 동작)', () => {
    const group = buildSlats(CTX, material(), 'front', OPTIONS);
    const boxes = drawnBoxes(group);
    expect(boxes.length).toBe(Math.floor(3.0 / 0.048));
    for (const box of boxes) {
      expect(box.min.y).toBeCloseTo(0.09, 3);
      expect(box.max.y).toBeCloseTo(WALL_H, 3);
    }
    // 창문 없는 면은 drawcall 1장 그대로여야 한다(ADR-0021 결정 5).
    expect(group.children.length).toBe(1);
  });

  it('창문과 겹치는 열은 개구부 안에 한 조각도 없다', () => {
    const group = buildSlats(CTX, material(), 'front', { ...OPTIONS, windowRect: WINDOW });
    for (const box of drawnBoxes(group)) {
      const overlapsX = box.max.x > WINDOW.alongMinM && box.min.x < WINDOW.alongMaxM;
      const overlapsY = box.max.y > WINDOW.yMinM + 1e-4 && box.min.y < WINDOW.yMaxM - 1e-4;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });

  it('겹치는 열은 사라지지 않고 창 위·아래로 나뉜다', () => {
    const group = buildSlats(CTX, material(), 'front', { ...OPTIONS, windowRect: WINDOW });
    const boxes = drawnBoxes(group);
    const inWindowColumn = boxes.filter(
      (b) => b.max.x > WINDOW.alongMinM && b.min.x < WINDOW.alongMaxM,
    );
    const below = inWindowColumn.filter((b) => b.max.y <= WINDOW.yMinM + 1e-4);
    const above = inWindowColumn.filter((b) => b.min.y >= WINDOW.yMaxM - 1e-4);
    expect(below.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(0);
    expect(below.length).toBe(above.length); // 같은 열이 두 토막
    // 창 양옆 열은 통짜로 남는다.
    expect(boxes.length).toBeGreaterThan(inWindowColumn.length);
  });

  it('인스턴스 번호가 열 번호와 같다 — 색 흔들림 시드가 열마다 고정이어야 한다', () => {
    const group = buildSlats(CTX, material(), 'front', { ...OPTIONS, windowRect: WINDOW });
    const n = Math.floor(3.0 / 0.048);
    const first = -((n - 1) * 0.048) / 2;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (const child of group.children) {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh.count).toBe(n); // 자기 몫이 아닌 열도 자리를 지킨다(스케일 0)
      for (let i = 0; i < n; i++) {
        mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.x).toBeCloseTo(first + i * 0.048, 5);
      }
    }
  });
});
