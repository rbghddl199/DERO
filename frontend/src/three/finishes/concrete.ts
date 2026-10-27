// CONCRETE 계열 — 노출 콘크리트 벽. 장식이 없는 유일한 계열이다 (ADR-0030 결정 2)
import * as THREE from 'three/webgpu';
import { concreteColor } from '@/three/finishes/nodes';
import { chipHex, type WallFinishModule } from '@/three/finishes/types';

interface ConcreteVariant {
  readonly label: string;
  readonly base: number;
  /** 타설 얼룩 쪽 색. */
  readonly blotch: number;
  readonly roughness: number;
}

const VARIANTS: Record<string, ConcreteVariant> = {
  LIGHT: { label: '라이트', base: 0xc2bfb9, blotch: 0x8b8882, roughness: 0.93 },
  DARK: { label: '다크', base: 0x74736f, blotch: 0x474644, roughness: 0.9 },
};

const DEFAULT_VARIANT = 'LIGHT';

export const concreteFinish: WallFinishModule = {
  family: 'CONCRETE',
  label: '콘크리트',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = VARIANTS[variant] ?? VARIANTS[DEFAULT_VARIANT];
    const material = new THREE.MeshStandardNodeMaterial({ roughness: v.roughness, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = concreteColor(v.base, v.blotch);
    return material;
  },
  /** 장식 없음 — 걸레받이도 몰딩도 없는 것이 이 계열의 룩이다. drawcall도 0장 는다. */
  decor(): null {
    return null;
  },
  decorDepthM(): number {
    return 0;
  },
};
