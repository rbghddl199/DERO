// 벽면 마감 계약 — 계열/변형 모듈의 타입 정본 (ADR-0030, ADR-0021 결정 1·2·6 계승)
import type * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import type { WallWindowConfig, WindowRectM } from '@/three/core/window';

/** 벽 3면. `scene.ts`의 동명 상수와 같은 집합이지만 그쪽은 모듈 로컬이라 여기서 다시 둔다. */
export const WALL_SIDES_ALL: readonly WallSide[] = ['left', 'front', 'right'];

/**
 * 재질 계열 — **룩의 정본은 코드다**(ADR-0021 결정 1 유지). 계열을 늘리는 일은 파일 하나 +
 * `index.ts` 한 줄이고 백엔드 배포가 붙지 않는다. WAS는 이 값으로 아무 판정도 하지 않는다
 * (형식 검증까지, ADR-0030 결정 3).
 */
export type WallMaterialFamily = 'PAINT' | 'WOOD_SLAT' | 'BRICK' | 'MARBLE' | 'CONCRETE';

export type FloorMaterialFamily = 'WOOD' | 'TILE' | 'CARPET';

/** 저장 컬럼 `placement.time_of_day`·`generated_image.time_of_day`와 같은 값 공간이다. */
export type TimeOfDay = 'DAY' | 'NIGHT';

/**
 * 마감이 읽는 씬 정보 — **읽기 전용 숫자만** 넘긴다.
 *
 * 메쉬·씬·렌더러를 통째로 넘기지 않는 이유는 권한 경계다(ADR-0021 결정 2, ADR-0030 결정 10
 * 유지): 벽은 배경이 아니라 기능 부품이라(벽걸이 배치점 raycast·충돌 클램프 평면·책상 깊이
 * 추종 z) 마감이 위치나 `visible`을 만질 수 있게 되는 순간 배치 판정이 조용히 깨진다.
 * **창문 개구부도 마감이 아니라 씬이 뚫는다**(ADR-0030 결정 5·10).
 */
export interface FinishContext {
  /** 벽 높이(m) — 벽걸이 수직 클램프와 같은 값(`core/snap.ts` `WALL_HEIGHT_M`). */
  readonly wallHeightM: number;
  /** 각 벽 평면 메쉬의 가로 폭(m). */
  readonly wallWidthM: Readonly<Record<WallSide, number>>;
  /** 각 벽 평면의 좌표(m) — 좌·우는 x, 전면은 z. 전면은 책상 깊이를 추종하므로
   *  마감 적용 시점의 값이고 캐시하면 안 된다. */
  readonly wallPlaneCoord: Readonly<Record<WallSide, number>>;
  /** 바닥(ground) 평면 한 변 길이(m). */
  readonly groundSizeM: number;
  /**
   * 각 면의 창문 사각형(벽 로컬 m — `along`은 벽 중앙 0, `y`는 바닥 기준). 창문이 없으면 null.
   *
   * **읽기 전용이고, 마감이 할 수 있는 일은 "개구부를 안 덮는 것" 하나다**(2026-08-10).
   * 구멍은 여전히 씬이 벽 지오메트리에 뚫는다(ADR-0030 결정 5) — 마감은 그 자리에 자기
   * 부조를 세우지 않기 위해서만 이 값을 본다. 이 필드가 없던 동안 우드 슬랫이 창문을
   * 통째로 덮었고(실측 개구부 b−r 30.7 → −12.6) 그것이 이 필드가 생긴 이유다.
   */
  readonly windowRectM: Readonly<Record<WallSide, WindowRectM | null>>;
}

/** 계열이 노출하는 변형 하나. **계열이 자기 목록을 정의하고 UI는 그것을 그대로 그린다** —
 *  자유 hex 피커를 복원하지 않는 이유가 이 구조다(ADR-0030 결정 2). */
export interface FinishVariant {
  /** 저장값. UPPER_SNAKE (`^[A-Z][A-Z0-9_]{0,29}$`) — BE V8 백필과 잠겨 있다. */
  readonly key: string;
  /** UI에 찍히는 이름. */
  readonly label: string;
  /** 변형 스와치 색 — 썸네일 이미지 파일은 만들지 않는다. */
  readonly chipColor: string;
}

/** 계열이 쥐고 있는 팔레트 숫자를 `FinishVariant.chipColor` 문자열로 옮긴다. */
export function chipHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * 벽 재질 계열 모듈.
 *
 * 금지 목록(ADR-0021 결정 2, ADR-0030 결정 10에서 유지): 광원 추가 · 벽·바닥의 위치·크기·
 * `visible` 변경 · 이산 벽 장식 · 자유 hex tint. 연속 부조 돌출은 `MAX_RELIEF_PROTRUSION_M`
 * 이하이고, 엔진이 `decor()` 결과의 `raycast`를 무력화해 충돌·호환 판정에서 뺀다.
 */
export interface WallFinishModule {
  readonly family: WallMaterialFamily;
  readonly label: string;
  readonly variants: readonly FinishVariant[];
  /** 미상 변형이 떨어질 자리. `variants`에 있어야 한다. */
  readonly defaultVariant: string;
  /** 벽 평면 재질. 호출할 때마다 **새 인스턴스**여야 한다(캐시·공유 금지) — 엔진이 면마다
   *  독립 인스턴스를 쥐고 교체 때 이전 재질을 dispose한다(ADR-0021 결정 6). */
  material(variant: string, ctx: FinishContext): THREE.NodeMaterial;
  /** 그 면의 연속 부조(슬랫·걸레받이). 없으면 null. */
  decor(variant: string, side: WallSide, ctx: FinishContext): THREE.Group | null;
  /** 그 면 부조가 방 안쪽으로 나온 깊이(m). 벽걸이 아이템 배치(`core/snap.ts`
   *  `resolveWallPose`)가 이 값보다 얇은 제품이 부조 뒤로 숨지 않게 앞면 여유를 보정한다.
   *  걸레받이처럼 벽걸이 높이에 안 닿는 부조는 0이다. */
  decorDepthM(variant: string): number;
}

export interface FloorFinishModule {
  readonly family: FloorMaterialFamily;
  readonly label: string;
  readonly variants: readonly FinishVariant[];
  readonly defaultVariant: string;
  material(variant: string, ctx: FinishContext): THREE.NodeMaterial;
}

/** 한 면(또는 바닥)의 저장값 한 벌. 미상 문자열이 그대로 올 수 있다 — WAS가 형식만 보므로
 *  좁히는 일은 `resolveWallFinish`·`resolveFloorFinish`의 몫이다. */
export interface FinishConfig {
  readonly material: string;
  readonly variant: string;
}

/** 벽 한 면의 저장값 — 마감 한 벌 + 창문 0~1개. 창문은 마감이 아니라 **씬이 벽
 *  지오메트리에 뚫는 구멍**이므로(ADR-0030 결정 5) 마감 모듈은 이 필드를 못 본다. */
export interface WallConfig extends FinishConfig {
  readonly window?: WallWindowConfig;
}

/** 씬의 단일 창구 `applyRoom(config)`가 받는 방 한 벌 (ADR-0030 결정 10). */
export interface RoomConfig {
  readonly walls: Readonly<Record<WallSide, WallConfig>>;
  readonly floor: FinishConfig;
  readonly timeOfDay: TimeOfDay;
}

/** `buildRoomSurfaces`가 만들어 주는 한 벌 — 씬은 이것을 끼우기만 한다. */
export interface RoomSurfaces {
  readonly wallMaterials: Record<WallSide, THREE.NodeMaterial>;
  readonly wallDecorDepthM: Record<WallSide, number>;
  /** 자식이 면별 그룹이고 `userData.wallSide`로 태그돼 있다 — 그 벽의 표시 상태·이동을
   *  따라가야 하기 때문이다(엔진 `syncFinishDecorVisibility`·`shiftFinishDecor`). */
  readonly decor: THREE.Group;
  readonly floorMaterial: THREE.NodeMaterial;
}

/**
 * 연속 부조가 방 안쪽으로 튀어나올 수 있는 최대 깊이(m, = 20mm).
 *
 * 벽걸이 아이템은 벽 평면 기준으로 배치되므로 부조가 그만큼 아이템을 파고든다. 실제
 * 시공도 슬랫 위로 뚫어 고정하는 방식이라 시각적으로 옳고, 20mm를 넘기면 관통이
 * 눈에 띄어 "사기 전 검증"이라는 제품 목적을 깎는다(ADR-0021 결정 2 가드).
 */
export const MAX_RELIEF_PROTRUSION_M = 0.02;
