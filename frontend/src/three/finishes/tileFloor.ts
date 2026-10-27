// TILE 바닥 계열 — 600mm 자기질 타일 + 줄눈 (ADR-0030 결정 2)
import * as THREE from 'three/webgpu';
import { tileFloorColor } from '@/three/finishes/nodes';
import { chipHex, type FloorFinishModule } from '@/three/finishes/types';

interface TileVariant {
  readonly label: string;
  readonly base: number;
  readonly grout: number;
  /** 한 장 크기(m) — 줄눈 간격이다. */
  readonly tileSizeM: number;
  readonly roughness: number;
}

const VARIANTS: Record<string, TileVariant> = {
  WHITE: { label: '화이트', base: 0xe9e7e2, grout: 0xc6c3bd, tileSizeM: 0.6, roughness: 0.35 },
  GRAY: { label: '그레이', base: 0x9b9a96, grout: 0x76756f, tileSizeM: 0.6, roughness: 0.4 },
};

const DEFAULT_VARIANT = 'WHITE';

export const tileFloorFinish: FloorFinishModule = {
  family: 'TILE',
  label: '타일',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = VARIANTS[variant] ?? VARIANTS[DEFAULT_VARIANT];
    const material = new THREE.MeshStandardNodeMaterial({ roughness: v.roughness, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = tileFloorColor(
      v.base,
      v.grout,
      v.tileSizeM,
    );
    return material;
  },
};
