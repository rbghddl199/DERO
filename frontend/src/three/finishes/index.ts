// 마감 계열 레지스트리 + 방 표면 조립 — 새 계열은 파일 하나 + 여기 한 줄 (ADR-0021 결정 1 계승)
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import { paintFinish } from '@/three/finishes/paint';
import { woodSlatFinish } from '@/three/finishes/woodSlat';
import { brickFinish } from '@/three/finishes/brick';
import { marbleFinish } from '@/three/finishes/marble';
import { concreteFinish } from '@/three/finishes/concrete';
import { woodFloorFinish } from '@/three/finishes/woodFloor';
import { tileFloorFinish } from '@/three/finishes/tileFloor';
import { carpetFinish } from '@/three/finishes/carpet';
import {
  WALL_SIDES_ALL,
  type FinishConfig,
  type FinishContext,
  type FloorMaterialFamily,
  type FloorFinishModule,
  type RoomConfig,
  type RoomSurfaces,
  type WallFinishModule,
  type WallMaterialFamily,
} from '@/three/finishes/types';

/**
 * **정적 import 맵이다 — 동적 `import()`를 쓰지 않는다.** 마감 그리드는 클릭해가며 훑는
 * UI라 청크 fetch가 끼면 전환마다 깜빡이고, 절차 마감은 에셋 0바이트라 모듈이 수 KB다.
 * 런타임 원격 코드 로드·`eval`도 금지다.
 *
 * `WallMaterialFamily`는 `types.ts`의 유니온이므로 계열을 늘리고 여기 항목을 빠뜨리면 타입
 * 에러가 난다 — 두 곳이 갈릴 수 없다.
 */
export const WALL_FINISHES: Record<WallMaterialFamily, WallFinishModule> = {
  PAINT: paintFinish,
  WOOD_SLAT: woodSlatFinish,
  BRICK: brickFinish,
  MARBLE: marbleFinish,
  CONCRETE: concreteFinish,
};

export const FLOOR_FINISHES: Record<FloorMaterialFamily, FloorFinishModule> = {
  WOOD: woodFloorFinish,
  TILE: tileFloorFinish,
  CARPET: carpetFinish,
};

/** 저장에서 생략됐거나 알 수 없을 때의 기본값 — `placement_wall`·`placement` DEFAULT와 같다. */
export const DEFAULT_WALL_FINISH: FinishConfig = { material: 'PAINT', variant: 'NEUTRAL' };
export const DEFAULT_FLOOR_FINISH: FinishConfig = { material: 'WOOD', variant: 'OAK' };

function isWallFamily(raw: string): raw is WallMaterialFamily {
  return Object.prototype.hasOwnProperty.call(WALL_FINISHES, raw);
}

function isFloorFamily(raw: string): raw is FloorMaterialFamily {
  return Object.prototype.hasOwnProperty.call(FLOOR_FINISHES, raw);
}

function hasVariant(finish: WallFinishModule | FloorFinishModule, key: string): boolean {
  return finish.variants.some((v) => v.key === key);
}

/**
 * 미상 계열·변형을 안전하게 좁힌다 — **에러를 던지지 않는다.** 계열 코드를 지웠다고 옛
 * 배치가 안 열리면 안 되므로 모르는 계열은 `PAINT` 기본 변형이고, 계열은 맞는데 변형만
 * 모르면 그 계열의 기본 변형이다(ADR-0030 결정 3).
 */
export function resolveWallFinish(config: FinishConfig): {
  family: WallMaterialFamily;
  variant: string;
} {
  if (!isWallFamily(config.material)) {
    return {
      family: DEFAULT_WALL_FINISH.material as WallMaterialFamily,
      variant: DEFAULT_WALL_FINISH.variant,
    };
  }
  const finish = WALL_FINISHES[config.material];
  return {
    family: config.material,
    variant: hasVariant(finish, config.variant) ? config.variant : finish.defaultVariant,
  };
}

export function resolveFloorFinish(config: FinishConfig): FinishConfig {
  if (!isFloorFamily(config.material)) return DEFAULT_FLOOR_FINISH;
  const finish = FLOOR_FINISHES[config.material];
  return {
    material: config.material,
    variant: hasVariant(finish, config.variant) ? config.variant : finish.defaultVariant,
  };
}

/**
 * 면 **하나**의 마감 한 벌 — 씬이 면 단위로 갈아 끼우는 단위다(마감 그리드는 클릭해 훑는
 * UI라 한 면을 바꿀 때 세 면을 다시 짓지 않는다).
 *
 * **캐시하지 않는다**(ADR-0021 결정 6 유지): 계열별 NodeMaterial 셰이더가 VRAM에 상주하는
 * 것을 막는다. 벽면 계열이 서로 다르면 셰이더 프로그램이 최대 3벌 동시에 존재한다.
 *
 * 창문 개구부는 여기서 뚫지 않는다 — 벽 지오메트리 소유권은 씬이다(ADR-0030 결정 5·10).
 */
export function buildWallSurface(
  config: FinishConfig,
  side: WallSide,
  ctx: FinishContext,
): { material: THREE.NodeMaterial; decor: THREE.Group; decorDepthM: number } {
  const { family, variant } = resolveWallFinish(config);
  const finish = WALL_FINISHES[family];

  const material = finish.material(variant, ctx);
  material.name = `${family}/${variant}`;

  // 면별 그룹으로 감싼다 — 그 벽이 꺼지거나 움직이면 통째로 따라가야 한다.
  const decor = finish.decor(variant, side, ctx) ?? new THREE.Group();
  decor.userData.wallSide = side;

  return { material, decor, decorDepthM: finish.decorDepthM(variant) };
}

/** 바닥 재질 한 벌. 벽과 독립 축이라 따로 짓는다. */
export function buildFloorMaterial(config: FinishConfig, ctx: FinishContext): THREE.NodeMaterial {
  const floor = resolveFloorFinish(config);
  const material = FLOOR_FINISHES[floor.material as FloorMaterialFamily].material(
    floor.variant,
    ctx,
  );
  material.name = `${floor.material}/${floor.variant}`;
  return material;
}

/** 방 한 벌 — 부팅처럼 네 표면을 한꺼번에 세울 때만 쓴다. 면 하나가 바뀐 전환은
 *  `buildWallSurface`를 그 면에만 부른다. */
export function buildRoomSurfaces(config: RoomConfig, ctx: FinishContext): RoomSurfaces {
  const wallMaterials = {} as Record<WallSide, THREE.NodeMaterial>;
  const wallDecorDepthM = {} as Record<WallSide, number>;
  const decor = new THREE.Group();

  for (const side of WALL_SIDES_ALL) {
    const surface = buildWallSurface(config.walls[side], side, ctx);
    wallMaterials[side] = surface.material;
    wallDecorDepthM[side] = surface.decorDepthM;
    decor.add(surface.decor);
  }

  const floorMaterial = buildFloorMaterial(config.floor, ctx);
  return { wallMaterials, wallDecorDepthM, decor, floorMaterial };
}
