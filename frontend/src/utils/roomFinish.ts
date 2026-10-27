// 방 표면 저장 형식(walls[]·floor·timeOfDay) ↔ 씬 RoomConfig 변환 — 두 표기의 유일한 경계
//
// `utils/wallSide.ts`와 같은 이유로 여기 한 곳에 가둔다: 저장은 면을 배열 + 대문자로 싣고
// 씬은 소문자 키의 레코드로 받는다(ADR-0030). 벽 표시 여부(`isOn`)는 마감과 같은 행에 있지만
// 씬에서는 `setWall`이 따로 소유하므로 이 모듈이 둘을 함께 옮긴다.

import {
  DEFAULT_FLOOR_FINISH,
  DEFAULT_WALL_FINISH,
  resolveFloorFinish,
  resolveWallFinish,
} from '@/three/finishes';
import {
  WALL_SIDES_ALL,
  type FinishConfig,
  type RoomConfig,
  type TimeOfDay,
  type WallConfig,
} from '@/three/finishes/types';
import type { WallWindowConfig } from '@/three/core/window';
import type { WallSide as EngineWallSide } from '@/three/core/snap';
import type { WallSnapshot } from '@/types/placement';
import { toApiWallSide, toEngineWallSide } from '@/utils/wallSide';

/** 상세 응답의 벽면 한 행. `WallDetailResponse`와 `WallSnapshot` 양쪽을 받는다 — 필드가
 *  같고, 리믹스 경로가 응답을 그대로 요청으로 옮기기 때문이다. */
interface WireWall {
  wallSide?: string | null;
  isOn?: boolean | null;
  distanceMm?: number | null;
  material?: string | null;
  variant?: string | null;
  hasWindow?: boolean | null;
  windowCenterXMm?: number | null;
  windowCenterYMm?: number | null;
  windowWidthMm?: number | null;
  windowHeightMm?: number | null;
}

/** 창문 4값이 전부 있어야 창문이다 — 일부만 온 행(옛 서버·수동 편집)은 창문 없음으로
 *  좁힌다(에러를 던지지 않는 이 모듈의 규약 그대로). */
function windowFromWire(wire: WireWall | undefined): WallWindowConfig | undefined {
  if (!wire?.hasWindow) return undefined;
  const { windowCenterXMm, windowCenterYMm, windowWidthMm, windowHeightMm } = wire;
  if (
    typeof windowCenterXMm !== 'number' ||
    typeof windowCenterYMm !== 'number' ||
    typeof windowWidthMm !== 'number' ||
    typeof windowHeightMm !== 'number' ||
    windowWidthMm <= 0 ||
    windowHeightMm <= 0
  ) {
    return undefined;
  }
  return {
    centerXMm: windowCenterXMm,
    centerYMm: windowCenterYMm,
    widthMm: windowWidthMm,
    heightMm: windowHeightMm,
  };
}

interface WireFinish {
  material?: string | null;
  variant?: string | null;
}

/** `resolveWallFinish`를 바닥(`resolveFloorFinish`)과 같은 시그니처로 맞춘다 — 좁히는 규칙을
 *  벽·바닥에 한 번만 쓰기 위해서다. */
function resolveWallFinishConfig(config: FinishConfig): FinishConfig {
  const { family, variant } = resolveWallFinish(config);
  return { material: family, variant };
}

/**
 * 저장값 한 벌을 씬이 쓸 모양으로 좁힌다 — **계열은 아는 것만 건드린다.**
 *
 * 계열이 있으면 계열은 살린다: 변형만 빠진 행(`{material:'BRICK'}`)에서 계열까지 버리면 남의
 * 벽이 통째로 페인트가 된다. 그 계열을 이 빌드가 알면 변형을 그 계열의 유효 값으로 좁히고
 * (안 좁히면 마감 그리드에 켜진 칩이 하나도 없고, 다음 저장이 죽은 변형 키를 다시 쓴다),
 * **모르는 계열이면 값을 그대로 통과시킨다.**
 *
 * 모르는 계열을 기본값으로 접으면 안 되는 이유는 저장 왕복이다 — 배포 중 옛 번들을 물고 있는
 * 탭이 새 계열(`BRICK/RED`)이 든 배치를 열면 그 값이 `PAINT/NEUTRAL`로 접혀 스토어 미러에
 * 앉고, 그 탭의 다음 저장이 남의 벽을 조용히 덮어쓴다. 화면이 폴백으로 그려지는 것은 씬의
 * `resolveWallFinish`가 이미 하고, 그 결과는 씬 밖으로 안 나간다 — 그것이 옳은 경계다
 * (BE가 `walls == null`을 "무변경"으로 두는 것과 같은 판단).
 */
function narrowFinish(
  wire: WireFinish | null | undefined,
  fallback: FinishConfig,
  known: (config: FinishConfig) => FinishConfig,
): FinishConfig {
  if (!wire?.material) return fallback;
  // 변형이 빠졌으면 빈 문자열로 넘긴다 — 다른 계열의 기본 변형을 끼워 넣으면 그 키가 우연히
  // 이 계열에도 있을 때 엉뚱한 변형으로 굳는다(계열 기본값은 계열이 정한다).
  const resolved = known({ material: wire.material, variant: wire.variant ?? '' });
  if (resolved.material !== wire.material) {
    return { material: wire.material, variant: wire.variant || fallback.variant };
  }
  return resolved;
}

/**
 * 저장값 → 씬 방 설정. **에러를 던지지 않는다** — 마감을 모르는(옛) 서버·클라이언트가 정상이라
 * 빠진 면은 기본 마감이다(ADR-0030 결정 3). 좁히는 규칙은 `narrowFinish` 주석에 있다.
 */
export function roomConfigFromWire(
  walls: readonly WireWall[] | null | undefined,
  floor: WireFinish | null | undefined,
  timeOfDay: TimeOfDay | null | undefined,
): RoomConfig {
  const bySide = new Map<EngineWallSide, WireWall>();
  for (const wall of walls ?? []) {
    if (wall.wallSide === 'LEFT' || wall.wallSide === 'FRONT' || wall.wallSide === 'RIGHT') {
      bySide.set(toEngineWallSide(wall.wallSide), wall);
    }
  }

  const configWalls = {} as Record<EngineWallSide, WallConfig>;
  for (const side of WALL_SIDES_ALL) {
    const wire = bySide.get(side);
    const window = windowFromWire(wire);
    configWalls[side] = {
      ...narrowFinish(wire, DEFAULT_WALL_FINISH, resolveWallFinishConfig),
      ...(window && { window }),
    };
  }

  return {
    walls: configWalls,
    floor: narrowFinish(floor, DEFAULT_FLOOR_FINISH, resolveFloorFinish),
    // 미상 문자열도 DAY로 좁힌다 — 타입은 런타임 JSON을 못 막고, 미상 값이 그대로 흐르면
    // roomRig의 'DAY' 등호 비교가 방 전체를 야간으로 그린다(마감 폴백과 같은 규약).
    timeOfDay: timeOfDay === 'NIGHT' ? 'NIGHT' : 'DAY',
  };
}

/** 저장값의 벽 표시 여부 — 정본은 `walls[].isOn`이다(옛 boolean 3컬럼은 V9 축소에서 사라졌다).
 *  행이 빠진 면은 구현 기본값(우측만 꺼짐)이다 — 이 모듈은 에러를 던지지 않는다. */
export function wallOnFromWire(
  walls: readonly WireWall[] | null | undefined,
): Record<EngineWallSide, boolean> {
  const bySide = new Map<string, WireWall>((walls ?? []).map((w) => [String(w.wallSide), w]));
  const out = {} as Record<EngineWallSide, boolean>;
  for (const side of WALL_SIDES_ALL) {
    const wall = bySide.get(toApiWallSide(side));
    out[side] = wall?.isOn ?? side !== 'right';
  }
  return out;
}

/** 벽 거리의 면별 기본값(mm) — 엔진 시작값과 같다(`scene.ts` WALL_LEFT_X · FRONT_WALL_GAP_DEFAULT_M).
 *  기준이 면마다 다르다: 좌·우는 책상 중심 거리, 전면은 책상 뒷변 간격이라 값도 다르다. */
export const DEFAULT_WALL_DISTANCE_MM: Record<EngineWallSide, number> = {
  left: 1550,
  front: 50,
  right: 1550,
};

/** 저장값의 벽 거리 — 행이 빠진 면은 기본값이다(`wallOnFromWire`와 같은 규약: 에러를 던지지 않는다).
 *  옛 배치는 이 필드가 없어 그대로 기본값으로 열린다. */
export function wallDistanceFromWire(
  walls: readonly WireWall[] | null | undefined,
): Record<EngineWallSide, number> {
  const bySide = new Map<string, WireWall>((walls ?? []).map((w) => [String(w.wallSide), w]));
  const out = {} as Record<EngineWallSide, number>;
  for (const side of WALL_SIDES_ALL) {
    out[side] = bySide.get(toApiWallSide(side))?.distanceMm ?? DEFAULT_WALL_DISTANCE_MM[side];
  }
  return out;
}

/**
 * 씬 → 저장값. **세 면을 전부 싣는다** — 일부만 보내면 서버가 400으로 거절한다(안 온 면이
 * 조용히 초기화되는 것을 막는 규칙, `PlacementSnapshotRequest.resolveWalls`).
 *
 * 창문 없는 면은 mm 4값을 생략한다 — `has_window = false`면 컬럼이 NULL이다(ERD).
 */
export function wallSnapshotsFromRoom(
  config: RoomConfig,
  wallOn: Record<EngineWallSide, boolean>,
  distanceMm: Record<EngineWallSide, number>,
): WallSnapshot[] {
  return WALL_SIDES_ALL.map((side) => {
    const { window } = config.walls[side];
    return {
      wallSide: toApiWallSide(side),
      isOn: wallOn[side],
      distanceMm: distanceMm[side],
      material: config.walls[side].material,
      variant: config.walls[side].variant,
      hasWindow: !!window,
      ...(window && {
        windowCenterXMm: window.centerXMm,
        windowCenterYMm: window.centerYMm,
        windowWidthMm: window.widthMm,
        windowHeightMm: window.heightMm,
      }),
    };
  });
}
