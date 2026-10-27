import { describe, it, expect } from 'vitest';
import { mountFaceAnchorLocal } from '../src/three/core/mountAnchor';

// VESA 판 예시 (결합 피벗 로컬, m): 100x100 판에 두께 8mm, 피벗에서 12mm 앞.
const min = { x: -0.05, y: -0.05, z: 0.008 };
const max = { x: 0.05, y: 0.05, z: 0.016 };

describe('mountFaceAnchorLocal (T1 회귀 — 암 헤드가 패널을 관통)', () => {
  it('X·Y는 판 중앙에 둔다', () => {
    const a = mountFaceAnchorLocal(min, max);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(0, 9);
  });

  it('Z는 판 중심이 아니라 접합면(+Z 바깥면)이다', () => {
    const a = mountFaceAnchorLocal(min, max);
    expect(a.z).toBeCloseTo(max.z, 9);
    // 중심을 쓰던 종전 동작과의 차이 = 판 두께의 절반 (모니터 안에 박히던 깊이)
    expect(a.z - (min.z + max.z) / 2).toBeCloseTo(0.004, 9);
  });

  it('판이 피벗 뒤(-Z)에 있어도 바깥면은 여전히 max.z다', () => {
    const a = mountFaceAnchorLocal(
      { x: -0.05, y: -0.05, z: -0.02 },
      { x: 0.05, y: 0.05, z: -0.012 },
    );
    expect(a.z).toBeCloseTo(-0.012, 9);
  });

  it('두께 0인 판(단일 평면)이면 앵커가 그 평면 위에 그대로 놓인다', () => {
    const a = mountFaceAnchorLocal({ x: -0.05, y: -0.05, z: 0.01 }, { x: 0.05, y: 0.05, z: 0.01 });
    expect(a.z).toBeCloseTo(0.01, 9);
  });
});
