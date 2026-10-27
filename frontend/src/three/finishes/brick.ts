// BRICK 계열 — 절차 벽돌 벽 + 걸레받이 (ADR-0030 결정 2). 텍스처 파일 0바이트
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import { buildWallBand } from '@/three/finishes/parts';
import { brickColor } from '@/three/finishes/nodes';
import {
  MAX_RELIEF_PROTRUSION_M,
  chipHex,
  type FinishContext,
  type WallFinishModule,
} from '@/three/finishes/types';

interface BrickVariant {
  readonly label: string;
  /** 벽돌 면 밝은 쪽. */
  readonly base: number;
  /** 벽돌 면 어두운 쪽 — 장마다 이 둘 사이에서 색이 흔들린다. */
  readonly deep: number;
  /** 줄눈(모르타르). */
  readonly mortar: number;
  readonly trim: number;
}

const VARIANTS: Record<string, BrickVariant> = {
  RED: { label: '적벽돌', base: 0x9c4a37, deep: 0x6f3226, mortar: 0xd8d0c4, trim: 0xe4e0d8 },
  WHITE: { label: '백벽돌', base: 0xe8e4dd, deep: 0xc9c3b8, mortar: 0xf2efe9, trim: 0xf7f5f1 },
  GRAY: { label: '회벽돌', base: 0x8a8781, deep: 0x5f5d59, mortar: 0xc3c0ba, trim: 0xdedbd6 },
};

const DEFAULT_VARIANT = 'RED';

const SKIRT_H = 0.09;
const SKIRT_D = MAX_RELIEF_PROTRUSION_M; // 20mm — 캡 그대로, PAINT 걸레받이와 같은 치수

function variantOf(key: string): BrickVariant {
  return VARIANTS[key] ?? VARIANTS[DEFAULT_VARIANT];
}

export const brickFinish: WallFinishModule = {
  family: 'BRICK',
  label: '벽돌',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = variantOf(variant);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = brickColor(
      v.base,
      v.deep,
      v.mortar,
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
          roughness: 0.78,
          metalness: 0,
        }),
        side,
        { centerY: SKIRT_H / 2, heightM: SKIRT_H, depthM: SKIRT_D },
      ),
    );
    return group;
  },
  /** 0이다 — 걸레받이만 있고 이유는 `paint.ts`의 같은 자리와 완전히 같다(높이별 보정이
   *  없어 20mm를 돌려주면 그 면의 벽 아이템 전량이 떠 버린다). */
  decorDepthM(): number {
    return 0;
  },
};
