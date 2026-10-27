// 모니터 화면 사진 — cover UV 핏과 IndexedDB 저장 키의 순수 함수 검증 (vitest env는 node라 IDB·canvas 경로는 e2e가 덮는다).
import { describe, it, expect } from 'vitest';
import { coverFit } from '../src/three/scene/screenTexture';
import { screenPhotoKey } from '../src/utils/screenPhotoStore';

const SCREEN_16_9 = 16 / 9;

describe('coverFit', () => {
  it('비율이 같으면 자르지 않는다', () => {
    expect(coverFit(SCREEN_16_9, SCREEN_16_9)).toEqual({
      repeatX: 1,
      repeatY: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('화면보다 가로로 긴 사진은 좌우를 잘라 가운데를 남긴다', () => {
    // 32:9 파노라마를 16:9 화면에 → 가로로 절반만 쓰고 1/4씩 잘라낸다
    const fit = coverFit(32 / 9, SCREEN_16_9);
    expect(fit.repeatX).toBeCloseTo(0.5);
    expect(fit.offsetX).toBeCloseTo(0.25);
    expect(fit.repeatY).toBe(1);
    expect(fit.offsetY).toBe(0);
  });

  it('화면보다 세로로 긴 사진은 위아래를 잘라 가운데를 남긴다', () => {
    // 1:1 정사각을 16:9 화면에 → 세로로 9/16만 쓴다
    const fit = coverFit(1, SCREEN_16_9);
    expect(fit.repeatY).toBeCloseTo(9 / 16);
    expect(fit.offsetY).toBeCloseTo((1 - 9 / 16) / 2);
    expect(fit.repeatX).toBe(1);
    expect(fit.offsetX).toBe(0);
  });

  it('잘라낸 양은 항상 양쪽으로 균등하다 — repeat + 2×offset = 1', () => {
    for (const imgAspect of [0.5, 1, 1.6, 2.4, 3.5]) {
      const fit = coverFit(imgAspect, SCREEN_16_9);
      expect(fit.repeatX + 2 * fit.offsetX).toBeCloseTo(1);
      expect(fit.repeatY + 2 * fit.offsetY).toBeCloseTo(1);
    }
  });

  it('비율을 못 구한 경우(0·NaN)엔 변환 없이 통짜로 쓴다', () => {
    const identity = { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };
    expect(coverFit(0, SCREEN_16_9)).toEqual(identity);
    expect(coverFit(SCREEN_16_9, 0)).toEqual(identity);
    expect(coverFit(Number.NaN, SCREEN_16_9)).toEqual(identity);
  });
});

describe('screenPhotoKey', () => {
  it('배치 id와 배치 아이템 id를 콜론으로 잇는다', () => {
    expect(screenPhotoKey(12, 3401)).toBe('12:3401');
  });

  it('같은 제품 모니터 두 대도 아이템 id가 달라 키가 갈린다', () => {
    expect(screenPhotoKey(12, 3401)).not.toBe(screenPhotoKey(12, 3402));
  });

  it('배치가 다르면 접두사가 달라 prune이 서로를 안 건드린다', () => {
    expect(screenPhotoKey(13, 3401).startsWith('12:')).toBe(false);
  });
});
