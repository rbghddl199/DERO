import { describe, it, expect } from 'vitest';
import {
  rayPlaneHit,
  angleAroundAxisDeg,
  rayAxisClosestMm,
  dominantAxis,
  sub,
  add,
  type Vec3,
} from '../src/three/core/gizmoMath';

const DOWN: Vec3 = [0, -1, 0];

describe('rayPlaneHit', () => {
  it('hits a horizontal plane below the ray origin', () => {
    const hit = rayPlaneHit({ origin: [0, 1, 0], dir: DOWN }, [0, 0.2, 0], [0, 1, 0])!;
    expect(hit[0]).toBeCloseTo(0, 6);
    expect(hit[1]).toBeCloseTo(0.2, 6);
    expect(hit[2]).toBeCloseTo(0, 6);
  });

  it('returns null when the ray is parallel to the plane', () => {
    expect(rayPlaneHit({ origin: [0, 1, 0], dir: [1, 0, 0] }, [0, 0.2, 0], [0, 1, 0])).toBeNull();
  });

  it('returns null when the plane is behind the ray', () => {
    expect(rayPlaneHit({ origin: [0, 1, 0], dir: [0, 1, 0] }, [0, 0.2, 0], [0, 1, 0])).toBeNull();
  });
});

describe('angleAroundAxisDeg', () => {
  it('measures a right-handed +90 about +Y (+X -> -Z)', () => {
    expect(angleAroundAxisDeg([1, 0, 0], [0, 0, -1], [0, 1, 0])).toBeCloseTo(90, 6);
  });

  it('is signed', () => {
    expect(angleAroundAxisDeg([1, 0, 0], [0, 0, 1], [0, 1, 0])).toBeCloseTo(-90, 6);
  });

  it('ignores the component along the axis (projects onto the joint plane)', () => {
    expect(angleAroundAxisDeg([1, 5, 0], [0, -3, -1], [0, 1, 0])).toBeCloseTo(90, 6);
  });

  it('returns 0 for identical directions', () => {
    expect(angleAroundAxisDeg([0, 0, 1], [0, 0, 2], [0, 1, 0])).toBeCloseTo(0, 6);
  });
});

describe('rayAxisClosestMm', () => {
  it('returns 0 mm when the ray aims straight at the pivot point', () => {
    expect(
      rayAxisClosestMm({ origin: [0, 0, 1], dir: [0, 0, -1] }, [0, 0, 0], [0, 1, 0]),
    ).toBeCloseTo(0, 6);
  });

  it('returns the signed travel in mm along the axis', () => {
    expect(
      rayAxisClosestMm({ origin: [0, 0.05, 1], dir: [0, 0, -1] }, [0, 0, 0], [0, 1, 0]),
    ).toBeCloseTo(50, 4);
    expect(
      rayAxisClosestMm({ origin: [0, -0.02, 1], dir: [0, 0, -1] }, [0, 0, 0], [0, 1, 0]),
    ).toBeCloseTo(-20, 4);
  });

  it('measures from the pivot point, not the world origin', () => {
    expect(
      rayAxisClosestMm({ origin: [0, 0.05, 1], dir: [0, 0, -1] }, [0, 0.03, 0], [0, 1, 0]),
    ).toBeCloseTo(20, 4);
  });

  it('returns null when the ray is parallel to the axis', () => {
    expect(
      rayAxisClosestMm({ origin: [0, 0, 1], dir: [0, 1, 0] }, [0, 0, 0], [0, 1, 0]),
    ).toBeNull();
  });
});

describe('dominantAxis', () => {
  it('picks the axis with the largest absolute component (sign ignored)', () => {
    expect(dominantAxis([1, 0, 0])).toBe('x');
    expect(dominantAxis([0, 1, 0])).toBe('y');
    expect(dominantAxis([0, 0, 1])).toBe('z');
    expect(dominantAxis([-5, 1, 2])).toBe('x');
  });

  it('breaks ties deterministically x > y > z', () => {
    expect(dominantAxis([1, 1, 0])).toBe('x'); // x vs y 동률 -> x
    expect(dominantAxis([1, 0, 1])).toBe('x'); // x vs z 동률 -> x
    expect(dominantAxis([0, 1, 1])).toBe('y'); // y vs z 동률 -> y
    expect(dominantAxis([1, 1, 1])).toBe('x'); // 셋 다 동률 -> x
  });
});

describe('sub / add', () => {
  it('subtracts componentwise', () => {
    expect(sub([1, 2, 3], [0.5, 1, 1.5])).toEqual([0.5, 1, 1.5]);
  });

  it('adds componentwise', () => {
    expect(add([1, 2, 3], [0.5, 1, 1.5])).toEqual([1.5, 3, 4.5]);
  });
});
