// PAINT 계열 — 페인트 벽 + 걸레받이 (ADR-0030 결정 2). 변형이 색을 소유하고 자유 hex는 없다
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import { buildWallBand } from '@/three/finishes/parts';
import { paintedWallColor } from '@/three/finishes/nodes';
import {
  MAX_RELIEF_PROTRUSION_M,
  chipHex,
  type FinishContext,
  type WallFinishModule,
} from '@/three/finishes/types';

interface PaintVariant {
  readonly label: string;
  /** 벽 바탕색. */
  readonly base: number;
  /** 밑동 가짜 바운스 — `base`와 같으면 그라디언트가 항등이라 단색이 된다. */
  readonly bounce: number;
  readonly roughness: number;
  /** 걸레받이 색. */
  readonly trim: number;
}

/**
 * 변형 팔레트. 무채·웜그레이·화이트·차콜은 옛 방 프리셋 4종에서 그대로 옮겼다 — 이관 매핑표
 * (ADR-0030 결정 12)가 이 키들에 잠겨 있고 BE V8 백필도 같은 토큰을 쓴다.
 *
 * **무채는 `base === bounce`라 현행 단색 벽(0xededec)과 픽셀 동일**이다. `e2e/lighting.spec.ts`의
 * 벽 R/B 중립 가드(0.9~1.12)가 지키던 값이 이것이고, 그 가드 자체는 03에서 검수 화면으로 옮긴다.
 */
const VARIANTS: Record<string, PaintVariant> = {
  NEUTRAL: { label: '무채', base: 0xededec, bounce: 0xededec, roughness: 0.97, trim: 0xe4e3e2 },
  WARM_GRAY: {
    label: '웜 그레이',
    base: 0xd8d0c4,
    bounce: 0xe3dcd0,
    roughness: 0.95,
    trim: 0xe8e3d9,
  },
  WHITE: { label: '화이트', base: 0xeceae5, bounce: 0xf4f0e8, roughness: 0.96, trim: 0xf7f5f1 },
  CHARCOAL: { label: '차콜', base: 0x33363a, bounce: 0x474b50, roughness: 0.94, trim: 0x25272b },
};

const DEFAULT_VARIANT = 'NEUTRAL';

const SKIRT_H = 0.09;
const SKIRT_D = MAX_RELIEF_PROTRUSION_M; // 20mm — 캡 그대로

function variantOf(key: string): PaintVariant {
  return VARIANTS[key] ?? VARIANTS[DEFAULT_VARIANT];
}

export const paintFinish: WallFinishModule = {
  family: 'PAINT',
  label: '페인트',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string, ctx: FinishContext): THREE.NodeMaterial {
    const v = variantOf(variant);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: v.roughness, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = paintedWallColor(
      v.base,
      v.bounce,
      ctx.wallHeightM,
    );
    return material;
  },
  decor(variant: string, side: WallSide, ctx: FinishContext): THREE.Group {
    const v = variantOf(variant);
    const group = new THREE.Group();
    group.add(
      buildWallBand(
        ctx,
        new THREE.MeshStandardNodeMaterial({ color: v.trim, roughness: 0.78, metalness: 0 }),
        side,
        { centerY: SKIRT_H / 2, heightM: SKIRT_H, depthM: SKIRT_D },
      ),
    );
    return group;
  },
  /**
   * 0이다 — 걸레받이는 20mm(캡 그대로)지만 **높이 90mm 아래에만** 있고, `decorDepthM`은
   * 그 면의 **모든 높이**에 일괄로 걸린다. 20mm를 돌려주면 벽 아이템 전량이 페인트 벽에서
   * 25mm 떠서 지금 화면이 통째로 바뀐다 — 걸레받이 높이에 걸리는 아이템 하나를 위해 치를
   * 값이 아니다.
   *
   * **알려진 한계**: 벽 아이템을 90mm 아래에 붙이면(`clampWallCenterY`가 바닥까지 허용한다)
   * 얇은 제품이 걸레받이에 묻힌다. 걸레받이가 있던 옛 `dark-studio`도 같은 상태였고
   * (`wallDecorDepthM` 미설정 = 0), 페인트가 3면 기본이 되면서 범위만 넓어졌다. 실제로
   * 밟으려면 벽걸이를 책상보다 한참 아래에 놓아야 한다. 높이별 보정이 필요해지면
   * `decorDepthM(variant)`를 `decorDepthM(variant, centerY)`로 넓히는 것이 정공법이다.
   */
  decorDepthM(): number {
    return 0;
  },
};
