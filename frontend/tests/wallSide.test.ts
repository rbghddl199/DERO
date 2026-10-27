import { describe, it, expect } from 'vitest';
import { toApiWallSide, toEngineWallSide } from '../src/utils/wallSide';
import { WALL_YAW_DEG, type WallSide as EngineWallSide } from '../src/three/core/snap';
import type { WallSide as ApiWallSide } from '../src/types/placement';

// 이름이 같은 두 `WallSide`(엔진 소문자 / 저장·API 대문자)의 경계 회귀 — 한쪽 값이
// 그대로 새면 저장은 통과하고 복원에서 벽을 못 찾는다 (DERO-375).
const ENGINE_SIDES: EngineWallSide[] = ['left', 'front', 'right'];
const API_SIDES: ApiWallSide[] = ['LEFT', 'FRONT', 'RIGHT'];

describe('WallSide 변환 (엔진 소문자 ↔ 저장 API 대문자)', () => {
  it('엔진 → API', () => {
    expect(toApiWallSide('left')).toBe('LEFT');
    expect(toApiWallSide('front')).toBe('FRONT');
    expect(toApiWallSide('right')).toBe('RIGHT');
  });

  it('API → 엔진', () => {
    expect(toEngineWallSide('LEFT')).toBe('left');
    expect(toEngineWallSide('FRONT')).toBe('front');
    expect(toEngineWallSide('RIGHT')).toBe('right');
  });

  it('엔진 값은 왕복해도 그대로다', () => {
    for (const side of ENGINE_SIDES) {
      expect(toEngineWallSide(toApiWallSide(side))).toBe(side);
    }
  });

  it('API 값도 왕복해도 그대로다', () => {
    for (const side of API_SIDES) {
      expect(toApiWallSide(toEngineWallSide(side))).toBe(side);
    }
  });

  it('엔진 3면이 전부 자세 표에 있다 (표가 갈리면 배치가 조용히 빠진다)', () => {
    for (const side of ENGINE_SIDES) {
      expect(WALL_YAW_DEG[side]).toBeTypeOf('number');
    }
  });
});
