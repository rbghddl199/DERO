// WOOD_SLAT 계열 — 어두운 배킹 벽 + 우드 슬랫 판재 + 걸레받이 (ADR-0030 결정 2, 14mm)
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import { buildSlats, buildWallBand } from '@/three/finishes/parts';
import { slatColor } from '@/three/finishes/nodes';
import {
  MAX_RELIEF_PROTRUSION_M,
  chipHex,
  type FinishContext,
  type WallFinishModule,
} from '@/three/finishes/types';

interface SlatVariant {
  readonly label: string;
  readonly slat: number;
  readonly grain: number;
  readonly grainScale: number;
  /** 판재 사이로 보이는 벽 바탕 — 실제 시공의 어두운 펠트다. 홈을 깊어 보이게 하는 전부. */
  readonly backing: number;
  readonly trim: number;
}

/**
 * 오크·애쉬는 옛 `oak-warm`·`white-clean` 슬랫 팔레트를 그대로 옮겼다(이관 매핑표가 이 두
 * 키에 잠겨 있다). 월넛은 ADR-0030 결정 2가 계열에 요구한 세 번째 변형이다.
 *
 * **배킹은 별도 판이 아니라 벽 재질 자체다.** 예전에는 벽 바탕이 페인트고 그 위에 얕은 배킹
 * 판을 깔았지만, 계열이 면 단위가 된 뒤로는 그 면 전체가 슬랫 벽이라 바탕이 곧 배킹이다
 * (판 하나와 drawcall 하나가 준다).
 */
const VARIANTS: Record<string, SlatVariant> = {
  OAK: {
    label: '오크',
    slat: 0xa8896a,
    grain: 0x836a50,
    grainScale: 6,
    backing: 0x3a3128,
    trim: 0xe8e3d9,
  },
  ASH: {
    label: '애쉬',
    slat: 0xdcc4a2,
    grain: 0xb99a72,
    grainScale: 7,
    backing: 0x554a3c,
    trim: 0xf7f5f1,
  },
  WALNUT: {
    label: '월넛',
    slat: 0x4a3626,
    grain: 0x2c1e13,
    grainScale: 6,
    backing: 0x241a12,
    trim: 0x2f2a24,
  },
};

const DEFAULT_VARIANT = 'OAK';

// 슬랫은 걸레받이보다 얕고 걸레받이 위에서 시작한다 — 같은 깊이로 겹치면 z-fighting이다.
const SLAT_D = MAX_RELIEF_PROTRUSION_M * 0.7; // 14mm — ADR-0030 결정 2가 못박은 값
const SLAT_W = 0.062;
// 갭 13mm. pitch 0.092는 갭이 30mm(폭의 48%)라 벽이 아니라 사우나 벤치 판재로 읽혔다.
const SLAT_PITCH = 0.075;
const SKIRT_H = 0.09;
const SKIRT_D = MAX_RELIEF_PROTRUSION_M; // 20mm

function variantOf(key: string): SlatVariant {
  return VARIANTS[key] ?? VARIANTS[DEFAULT_VARIANT];
}

export const woodSlatFinish: WallFinishModule = {
  family: 'WOOD_SLAT',
  label: '우드 슬랫',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.slat),
  })),
  material(variant: string): THREE.NodeMaterial {
    return new THREE.MeshStandardNodeMaterial({
      color: variantOf(variant).backing,
      roughness: 0.9,
      metalness: 0,
    });
  },
  decor(variant: string, side: WallSide, ctx: FinishContext): THREE.Group {
    const v = variantOf(variant);
    const group = new THREE.Group();

    const slatMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
    (slatMat as unknown as { colorNode: unknown }).colorNode = slatColor(
      v.slat,
      v.grain,
      v.grainScale,
    );
    group.add(
      buildSlats(ctx, slatMat, side, {
        pitchM: SLAT_PITCH,
        widthM: SLAT_W,
        depthM: SLAT_D,
        bottomY: SKIRT_H,
        topY: ctx.wallHeightM,
        // 창문을 덮지 않게 그 열만 위·아래로 자른다 — 마감이 개구부를 볼 수 있는 유일한 이유다.
        windowRect: ctx.windowRectM[side],
      }),
    );

    group.add(
      buildWallBand(
        ctx,
        new THREE.MeshStandardNodeMaterial({ color: v.trim, roughness: 0.8, metalness: 0 }),
        side,
        { centerY: SKIRT_H / 2, heightM: SKIRT_H, depthM: SKIRT_D },
      ),
    );
    return group;
  },
  decorDepthM(): number {
    return SLAT_D;
  },
};
