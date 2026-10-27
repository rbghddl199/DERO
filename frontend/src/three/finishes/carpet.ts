// CARPET 바닥 계열 — 파일(pile) 카펫. 완전 무광이다 (ADR-0030 결정 2)
import * as THREE from 'three/webgpu';
import { carpetColor } from '@/three/finishes/nodes';
import { chipHex, type FloorFinishModule } from '@/three/finishes/types';

interface CarpetVariant {
  readonly label: string;
  readonly base: number;
  /** 파일 끝 색 — 이 둘의 고주파 혼합이 곧 결이다. */
  readonly fibre: number;
}

const VARIANTS: Record<string, CarpetVariant> = {
  GRAY: { label: '그레이', base: 0x767470, fibre: 0x565450 },
  BEIGE: { label: '베이지', base: 0xc4b49a, fibre: 0xa08e73 },
};

const DEFAULT_VARIANT = 'GRAY';

export const carpetFinish: FloorFinishModule = {
  family: 'CARPET',
  label: '카펫',
  defaultVariant: DEFAULT_VARIANT,
  variants: Object.entries(VARIANTS).map(([key, v]) => ({
    key,
    label: v.label,
    chipColor: chipHex(v.base),
  })),
  material(variant: string): THREE.NodeMaterial {
    const v = VARIANTS[variant] ?? VARIANTS[DEFAULT_VARIANT];
    // 카펫은 정반사가 없다 — roughness 1이 아니면 바닥에 램프 하이라이트가 맺혀 비닐로 읽힌다.
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    (material as unknown as { colorNode: unknown }).colorNode = carpetColor(v.base, v.fibre);
    return material;
  },
};
