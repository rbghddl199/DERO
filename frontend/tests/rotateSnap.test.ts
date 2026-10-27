import { describe, it, expect } from 'vitest';
import {
  ROTATE_STEP_DEG,
  ROTATE_SNAP_THRESHOLD_DEG,
  snapYawDeg,
  yawFromRingOffset,
} from '../src/three/core/rotateSnap';

describe('snapYawDeg — 45° 자석 스냅 (ADR-0022 결정 7)', () => {
  it('격자 배수는 그대로 통과한다', () => {
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      expect(snapYawDeg(deg)).toBeCloseTo(deg, 6);
    }
  });

  it('격자에서 임계값 미만이면 끌어당긴다', () => {
    expect(snapYawDeg(44)).toBeCloseTo(45, 6);
    expect(snapYawDeg(46)).toBeCloseTo(45, 6);
    expect(snapYawDeg(50.9)).toBeCloseTo(45, 6);
    expect(snapYawDeg(39.1)).toBeCloseTo(45, 6);
    expect(snapYawDeg(4)).toBeCloseTo(0, 6);
  });

  it('임계값 이상이면 손대지 않는다 — 경계값 6°는 스냅하지 않는다', () => {
    expect(snapYawDeg(51)).toBeCloseTo(51, 6); // 정확히 +6°
    expect(snapYawDeg(39)).toBeCloseTo(39, 6); // 정확히 -6°
    expect(snapYawDeg(38.9)).toBeCloseTo(38.9, 6);
    expect(snapYawDeg(67.5)).toBeCloseTo(67.5, 6); // 격자 중간 — 어느 쪽도 안 문다
  });

  it('0/360 경계에서 랩한다 — 반환은 항상 [0,360)', () => {
    expect(snapYawDeg(359)).toBeCloseTo(0, 6);
    expect(snapYawDeg(357.5)).toBeCloseTo(0, 6);
    expect(snapYawDeg(353)).toBeCloseTo(353, 6); // 360에서 7° — 안 문다
    expect(snapYawDeg(360)).toBeCloseTo(0, 6);
    expect(snapYawDeg(405)).toBeCloseTo(45, 6);
    expect(snapYawDeg(-1)).toBeCloseTo(0, 6);
    expect(snapYawDeg(-46)).toBeCloseTo(315, 6);
    expect(snapYawDeg(-353)).toBeCloseTo(7, 6); // 정규화 7°, 격자에서 7° — 그대로
  });

  it('격자·임계값은 인자로 바꿀 수 있다', () => {
    expect(snapYawDeg(89, 90, 2)).toBeCloseTo(90, 6);
    expect(snapYawDeg(87, 90, 2)).toBeCloseTo(87, 6);
    expect(ROTATE_STEP_DEG).toBe(45);
    expect(ROTATE_SNAP_THRESHOLD_DEG).toBe(6);
  });
});

describe('yawFromRingOffset — 링 평면 위 한 점의 yaw', () => {
  it('three의 Y축 회전 규약과 같은 각을 낸다 (+Z=0°, +X=90°)', () => {
    expect(yawFromRingOffset(0, 1)).toBeCloseTo(0, 6);
    expect(yawFromRingOffset(1, 0)).toBeCloseTo(90, 6);
    expect(yawFromRingOffset(0, -1)).toBeCloseTo(180, 6);
    expect(yawFromRingOffset(-1, 0)).toBeCloseTo(270, 6);
    expect(yawFromRingOffset(1, 1)).toBeCloseTo(45, 6);
  });

  it('반지름과 무관하다 — 방향만 본다', () => {
    expect(yawFromRingOffset(0.3, 0.3)).toBeCloseTo(yawFromRingOffset(3, 3), 6);
  });

  it('드래그 델타로 쓰면 잡은 지점이 튀지 않는다', () => {
    // 잡은 각도와 현재 각도의 차이를 시작 yaw에 더하는 사용법 — 같은 점이면 델타 0.
    const grabbed = yawFromRingOffset(0.2, -0.15);
    expect(yawFromRingOffset(0.2, -0.15) - grabbed).toBeCloseTo(0, 9);
  });
});
