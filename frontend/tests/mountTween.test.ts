// 자석 부착 트윈의 진행·이징 수학 (D22 B). 실제 lerp·slerp는 scene이 three로 하고,
// 여기서는 "언제 얼마나 갔는가"만 가둔다 — 특히 끝에서 **정확히 1**이어야 목표 포즈에
// 오차 없이 안착한다(부동소수 잔차가 남으면 결합면이 미세하게 뜬다).
import { describe, it, expect } from 'vitest';
import {
  MOUNT_DURATION_MS,
  mountEase,
  mountProgress,
  mountDone,
} from '../src/three/core/mountTween';

describe('mountEase', () => {
  it('양 끝을 정확히 물린다', () => {
    expect(mountEase(0)).toBe(0);
    expect(mountEase(1)).toBe(1);
  });

  it('ease-out — 전반부에 이미 절반을 넘어간다', () => {
    expect(mountEase(0.5)).toBeGreaterThan(0.5);
  });

  it('단조 증가한다', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = mountEase(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('구간 밖 입력은 클램프한다 — 프레임 하나가 튀어도 포즈가 발산하지 않는다', () => {
    expect(mountEase(-3)).toBe(0);
    expect(mountEase(7)).toBe(1);
  });
});

describe('mountProgress', () => {
  it('시작은 0', () => {
    expect(mountProgress(0)).toBe(0);
  });

  it('지속시간 이상이면 정확히 1 — 목표에 오차 없이 안착한다', () => {
    expect(mountProgress(MOUNT_DURATION_MS)).toBe(1);
    expect(mountProgress(MOUNT_DURATION_MS + 500)).toBe(1);
  });

  it('중간값은 (0,1) 안이고 이징을 탄다', () => {
    const mid = mountProgress(MOUNT_DURATION_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(mid).toBe(mountEase(0.5));
  });
});

describe('mountDone', () => {
  it('지속시간에 도달해야 끝난다', () => {
    expect(mountDone(0)).toBe(false);
    expect(mountDone(MOUNT_DURATION_MS - 1)).toBe(false);
    expect(mountDone(MOUNT_DURATION_MS)).toBe(true);
  });

  it('드롭 트윈(140ms)보다 길다 — 결합은 착지보다 무게감 있게 읽혀야 한다', () => {
    expect(MOUNT_DURATION_MS).toBeGreaterThan(140);
  });
});
