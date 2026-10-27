// 방 프리셋 — 3면 + 바닥 값을 한 번에 채워 주는 **프리필 버튼**이다. 저장되지 않는다 (ADR-0030 결정 1)
//
// **이 파일은 런타임에 three를 안 끌고 온다**(순수 데이터다). 그래서 저장·복원 경로
// (`api/placement.ts` 등 시뮬레이터 밖 화면이 쓰는 모듈)가 프리셋 폴백을 쓰면서도 3D 번들을
// 떠안지 않는다 — 실제 마감 구현(`WALL_FINISHES`)만 `finishes/index.ts`에 있다.
import { WALL_SIDES_ALL, type FinishConfig, type RoomConfig } from '@/three/finishes/types';

/** 프리셋 키 — 옛 `placement.theme_key` 문자열 공간과 같다(이관 대상). */
export const ROOM_PRESET_KEYS = ['neutral', 'oak-warm', 'white-clean', 'dark-studio'] as const;

export type RoomPresetKey = (typeof ROOM_PRESET_KEYS)[number];

export const DEFAULT_ROOM_PRESET_KEY: RoomPresetKey = 'neutral';

export interface RoomPreset {
  readonly key: RoomPresetKey;
  /** 프리셋 칩에 찍히는 이름. */
  readonly label: string;
  /** 칩 그라디언트 2색 [벽, 바닥] — 썸네일 이미지 파일은 만들지 않는다. */
  readonly chipColors: readonly [string, string];
  readonly config: RoomConfig;
}

const PAINT = (variant: string) => ({ material: 'PAINT', variant });
const SLAT = (variant: string) => ({ material: 'WOOD_SLAT', variant });
const WOOD = (variant: string) => ({ material: 'WOOD', variant });

/**
 * 옛 방 프리셋 4종의 **이관 매핑**(ADR-0030 결정 12) — 결정론적이고, 이 표가 곧 계약이다.
 * `has_window`는 전부 없음, `time_of_day`는 전부 `DAY`다.
 *
 * 창문 있는 프리셋(`morning-window`·`night-city`)은 **창밖 풍경 티켓(DERO-512)에서
 * 붙는다** — 개구부(511)만으로는 구멍 너머가 스튜디오 배경이라 프리셋으로 내밀 그림이
 * 아니다. 그때 프리셋이 창문 값도 쓰게 되므로 applyRoomPreset의 창문 보존 규칙을 같이
 * 다시 본다.
 */
export const ROOM_PRESETS: Record<RoomPresetKey, RoomPreset> = {
  neutral: {
    key: 'neutral',
    label: '기본',
    chipColors: ['#ededec', '#9d8565'],
    config: {
      walls: { left: PAINT('NEUTRAL'), front: PAINT('NEUTRAL'), right: PAINT('NEUTRAL') },
      floor: WOOD('OAK'),
      timeOfDay: 'DAY',
    },
  },
  'oak-warm': {
    key: 'oak-warm',
    label: '오크 웜',
    chipColors: ['#a8896a', '#7d6549'],
    config: {
      walls: { left: SLAT('OAK'), front: SLAT('OAK'), right: PAINT('WARM_GRAY') },
      floor: WOOD('OAK'),
      timeOfDay: 'DAY',
    },
  },
  'white-clean': {
    key: 'white-clean',
    label: '화이트 클린',
    chipColors: ['#efedea', '#d3b791'],
    config: {
      walls: { left: PAINT('WHITE'), front: SLAT('ASH'), right: PAINT('WHITE') },
      floor: WOOD('LIGHT_OAK'),
      timeOfDay: 'DAY',
    },
  },
  'dark-studio': {
    key: 'dark-studio',
    label: '다크 스튜디오',
    chipColors: ['#34373b', '#3c2a1e'],
    config: {
      walls: { left: PAINT('CHARCOAL'), front: PAINT('CHARCOAL'), right: PAINT('CHARCOAL') },
      floor: WOOD('WALNUT'),
      timeOfDay: 'DAY',
    },
  },
};

export function roomConfigForPreset(key: RoomPresetKey): RoomConfig {
  return ROOM_PRESETS[key].config;
}

/**
 * 지금 방이 어느 프리셋과 같은 값인지 — 칩 활성 표시가 읽는다.
 *
 * **"적용된 프리셋"이라는 상태는 존재하지 않는다**(ADR-0030 결정 1): 프리셋은 벽면 값에
 * 써넣는 버튼이고 저장되지 않으므로, 한 면만 고친 방은 어느 프리셋도 아니다(`null`).
 * 시간대는 보지 않는다 — 프리셋 칩은 마감을 고르는 버튼이고 시간대는 별도 축이다.
 */
export function roomPresetKeyOf(config: RoomConfig): RoomPresetKey | null {
  const same = (a: FinishConfig, b: FinishConfig): boolean =>
    a.material === b.material && a.variant === b.variant;
  return (
    ROOM_PRESET_KEYS.find((key) => {
      const preset = ROOM_PRESETS[key].config;
      return (
        WALL_SIDES_ALL.every((side) => same(config.walls[side], preset.walls[side])) &&
        same(config.floor, preset.floor)
      );
    }) ?? null
  );
}
