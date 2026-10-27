// WOOD 바닥 계열 — 마루 널. 변형은 옛 방 프리셋 3종의 바닥 팔레트를 그대로 옮겼다
import * as THREE from 'three/webgpu';
import { plankFloorColor } from '@/three/finishes/nodes';
import { chipHex, type FloorFinishModule } from '@/three/finishes/types';

interface WoodFloorVariant {
  readonly label: string;
  readonly base: number;
  readonly grain: number;
  /** 널 폭(m) — 이음매 간격이다. */
  readonly plankWidthM: number;
  readonly grainScale: number;
  readonly roughness: number;
}

const VARIANTS: Record<string, WoodFloorVariant> = {
  OAK: {
    label: '오크',
    base: 0x9d8565,
    grain: 0x76614a,
    plankWidthM: 0.19,
    grainScale: 3,
    roughness: 0.8,
  },
  LIGHT_OAK: {
    label: '라이트 오크',
    base: 0xc9ab84,
    grain: 0x9c7d55,
    plankWidthM: 0.16,
    grainScale: 3.5,
    roughness: 0.75,
  },
  WALNUT: {
    label: '월넛',
    base: 0x35251a,
    grain: 0x1c1209,
    plankWidthM: 0.18,
    grainScale: 3,
    roughness: 0.85,
  },
};

const DEFAULT_VARIANT = 'OAK';

export const woodFloorFinish: FloorFinishModule = {
  family: 'WOOD',
  label: '마루',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = VARIANTS[variant] ?? VARIANTS[DEFAULT_VARIANT];
    const material = new THREE.MeshStandardNodeMaterial({ roughness: v.roughness, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = plankFloorColor(
      v.base,
      v.grain,
      v.plankWidthM,
      v.grainScale,
    );
    return material;
  },
};
