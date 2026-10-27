// MARBLE 계열 — 절차 대리석 벽 + 천장 몰딩 (ADR-0030 결정 2)
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import { buildWallBand } from '@/three/finishes/parts';
import { marbleColor } from '@/three/finishes/nodes';
import {
  MAX_RELIEF_PROTRUSION_M,
  chipHex,
  type FinishContext,
  type WallFinishModule,
} from '@/three/finishes/types';

interface MarbleVariant {
  readonly label: string;
  readonly base: number;
  readonly vein: number;
  /** 맥 두께 — 작을수록 얇고 선명하다. */
  readonly veinWidth: number;
  /** 연마 대리석이라 다른 계열보다 훨씬 낮다. */
  readonly roughness: number;
  readonly trim: number;
}

const VARIANTS: Record<string, MarbleVariant> = {
  WHITE: {
    label: '화이트',
    base: 0xf0eeea,
    vein: 0xa9a49b,
    veinWidth: 0.06,
    roughness: 0.28,
    trim: 0xf7f5f1,
  },
  BLACK: {
    label: '블랙',
    base: 0x22232a,
    vein: 0x8f8d92,
    veinWidth: 0.05,
    roughness: 0.24,
    trim: 0x2a2b32,
  },
};

const DEFAULT_VARIANT = 'WHITE';

// 몰딩은 천장선에 붙는 띠다 — 걸레받이(90mm)보다 얇고 얕다.
const MOLDING_H = 0.07;
const MOLDING_D = MAX_RELIEF_PROTRUSION_M * 0.9; // 18mm

function variantOf(key: string): MarbleVariant {
  return VARIANTS[key] ?? VARIANTS[DEFAULT_VARIANT];
}

export const marbleFinish: WallFinishModule = {
  family: 'MARBLE',
  label: '대리석',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = variantOf(variant);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: v.roughness, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = marbleColor(
      v.base,
      v.vein,
      v.veinWidth,
    );
    return material;
  },
  decor(variant: string, side: WallSide, ctx: FinishContext): THREE.Group {
    const group = new THREE.Group();
    group.add(
      buildWallBand(
        ctx,
        new THREE.MeshStandardNodeMaterial({
          color: variantOf(variant).trim,
          roughness: 0.6,
          metalness: 0,
        }),
        side,
        {
          centerY: ctx.wallHeightM - MOLDING_H / 2,
          heightM: MOLDING_H,
          depthM: MOLDING_D,
        },
      ),
    );
    return group;
  },
  /**
   * 0이다 — `paint.ts`의 걸레받이와 **정확히 대칭**인 판단이다. 걸레받이가 면의 맨 아래
   * 90mm에만 있듯 몰딩은 맨 위 70mm에만 있는데, `decorDepthM`은 그 면의 **모든 높이**에
   * 일괄로 걸린다. 18mm를 돌려주면 벽걸이 아이템 전량이 대리석 벽에서 23mm 떠 버린다.
   *
   * **알려진 한계**: `clampWallCenterY`는 천장에 딱 붙는 높이까지 허용하므로, 맨 위 70mm에
   * 붙인 얇은 벽걸이는 몰딩 뒤에 묻힌다(걸레받이의 바닥 쪽 한계와 같은 모양). 높이별 보정이
   * 필요해지면 `decorDepthM(variant)`를 `decorDepthM(variant, centerY)`로 넓히는 것이
   * 정공법이고, **계열이 위·아래 양끝에 다 생긴 지금이 그 확장을 정당화하는 두 번째 사례다.**
   */
  decorDepthM(): number {
    return 0;
  },
};
