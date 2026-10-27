import { describe, it, expect } from 'vitest';
import { LOOK_VARIANTS, DEFAULT_LOOK_ID, findLookVariant } from '../src/three/scene/lookVariants';

describe('LOOK_VARIANTS 테이블 (DERO-162 발광 룩 변형 스위처)', () => {
  it('변형은 4~6종 — 티켓이 요구한 판정 범위', () => {
    expect(LOOK_VARIANTS.length).toBeGreaterThanOrEqual(4);
    expect(LOOK_VARIANTS.length).toBeLessThanOrEqual(6);
  });

  it('id가 유일하다 (HUD 칩 key·data-testid 충돌 방지)', () => {
    const ids = LOOK_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DEFAULT_LOOK_ID가 테이블에 실제로 존재한다', () => {
    expect(LOOK_VARIANTS.some((v) => v.id === DEFAULT_LOOK_ID)).toBe(true);
  });

  it('current 변형은 postfx 기본 유니폼과 같다 — 기본 룩 무변경 가드', () => {
    const current = findLookVariant('current');
    expect(current).toBeDefined();
    expect(current?.bloom).toEqual({ strength: 0.75, radius: 0.6 });
    expect(current?.glare).toEqual({ strength: 0.4, threshold: 50 });
  });

  it('모든 glare.threshold가 45 이상 — 흰 벽 천장(21~22)의 2배 규칙', () => {
    for (const v of LOOK_VARIANTS) {
      expect(v.glare.threshold).toBeGreaterThanOrEqual(45);
    }
  });

  it('bloom.radius는 0 초과 1 이하, strength는 0 이상', () => {
    for (const v of LOOK_VARIANTS) {
      expect(v.bloom.radius).toBeGreaterThan(0);
      expect(v.bloom.radius).toBeLessThanOrEqual(1);
      expect(v.bloom.strength).toBeGreaterThanOrEqual(0);
      expect(v.glare.strength).toBeGreaterThanOrEqual(0);
    }
  });

  it('label·intent가 비어 있지 않다 (HUD 칩·판정 시트가 그대로 쓴다)', () => {
    for (const v of LOOK_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.intent.length).toBeGreaterThan(0);
    }
  });
});

describe('findLookVariant', () => {
  it('테이블의 모든 id로 왕복한다', () => {
    for (const v of LOOK_VARIANTS) {
      expect(findLookVariant(v.id)).toBe(v);
    }
  });

  it('미지 id는 undefined — 스토어가 false를 돌려줄 근거', () => {
    expect(findLookVariant('nope')).toBeUndefined();
    expect(findLookVariant('')).toBeUndefined();
  });
});
