// 엔진 벽 면(소문자) ↔ 배치 API 벽 면(대문자) 변환 — 이름이 같은 두 타입의 유일한 경계
//
// `WallSide`라는 이름의 타입이 둘이다: 엔진(`three/core/snap.ts`, `'left' | 'front' | 'right'`)과
// 저장·API(`types/placement.ts`, `'LEFT' | 'FRONT' | 'RIGHT'` — 정본은 백엔드 `placement/WallSide.java`
// + `erd.md`). 문자열이라 서로 대입은 안 되지만 사람이 헷갈려서, 변환을 여기 한 곳에 가둔다.

import type { WallSide as EngineWallSide } from '@/three/core/snap';
import type { WallSide as ApiWallSide } from '@/types/placement';

const TO_API: Readonly<Record<EngineWallSide, ApiWallSide>> = {
  left: 'LEFT',
  front: 'FRONT',
  right: 'RIGHT',
};

const TO_ENGINE: Readonly<Record<ApiWallSide, EngineWallSide>> = {
  LEFT: 'left',
  FRONT: 'front',
  RIGHT: 'right',
};

/** 엔진 → 저장 (`placed_item.wall_side`). */
export function toApiWallSide(side: EngineWallSide): ApiWallSide {
  return TO_API[side];
}

/** 저장 → 엔진. */
export function toEngineWallSide(side: ApiWallSide): EngineWallSide {
  return TO_ENGINE[side];
}
