import { describe, it, expect } from 'vitest';
import {
  DROP_HEIGHT_M,
  DROP_DURATION_MS,
  dropEase,
  dropOffsetY,
  dropDone,
} from '../src/three/core/dropTween';

describe('dropEase (ease-out 곡선)', () => {
  it('0에서 시작해 1에서 끝난다', () => {
    expect(dropEase(0)).toBeCloseTo(0, 9);
    expect(dropEase(1)).toBeCloseTo(1, 9);
  });

  it('범위 밖 입력을 [0,1]로 클램프한다', () => {
    expect(dropEase(-0.5)).toBeCloseTo(0, 9);
    expect(dropEase(2)).toBeCloseTo(1, 9);
  });

  it('ease-out — 전반부에 이미 절반 이상 진행한다', () => {
    expect(dropEase(0.5)).toBeGreaterThan(0.5);
  });

  it('단조 증가한다', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = dropEase(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('dropOffsetY (착지 높이 오프셋)', () => {
  it('시작 순간엔 규정 높이만큼 떠 있다', () => {
    expect(dropOffsetY(0)).toBeCloseTo(DROP_HEIGHT_M, 9);
  });

  it('지속시간이 지나면 정확히 0 — 최종 위치와 어긋나지 않는다', () => {
    expect(dropOffsetY(DROP_DURATION_MS)).toBe(0);
    expect(dropOffsetY(DROP_DURATION_MS * 3)).toBe(0);
  });

  it('단조 감소하며 음수로 내려가지 않는다 (바운스 없음)', () => {
    let prev = Infinity;
    for (let ms = 0; ms <= DROP_DURATION_MS; ms += 10) {
      const y = dropOffsetY(ms);
      expect(y).toBeLessThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(0);
      prev = y;
    }
  });

  it('음수 경과시간은 시작 상태로 취급한다', () => {
    expect(dropOffsetY(-20)).toBeCloseTo(DROP_HEIGHT_M, 9);
  });
});

describe('dropDone', () => {
  it('지속시간 전에는 false, 도달하면 true', () => {
    expect(dropDone(0)).toBe(false);
    expect(dropDone(DROP_DURATION_MS - 1)).toBe(false);
    expect(dropDone(DROP_DURATION_MS)).toBe(true);
    expect(dropDone(DROP_DURATION_MS + 100)).toBe(true);
  });
});
