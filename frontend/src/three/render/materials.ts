// 재질 클래스별 PBR 머티리얼 스킨 — 나무는 격리된 TSL 그레인 노드 사용, 클래스 전반에 일관된 스튜디오 클레이 톤 적용
import * as THREE from 'three/webgpu';
import { woodGrainColor } from './woodGrainNode';
import { ToonPhysicalNodeMaterial } from './toonPhysical';
import type { MaterialSkin } from '../scene/product';

function darken(hex: number, f: number): number {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

export function materialForSkin(skin: MaterialSkin): THREE.MeshPhysicalNodeMaterial {
  // D17: ToonPhysicalNodeMaterial = MeshPhysicalNodeMaterial + weak direct-diffuse
  // toon ramp (see toonPhysical.ts). Every product routes through here, so the
  // stylized lighting response is applied uniformly; all skin properties below
  // (colorNode, clearcoat, transmission, emissive) behave identically.
  const mat = new ToonPhysicalNodeMaterial({
    color: skin.baseColor,
    roughness: skin.roughness,
    metalness: skin.metalness,
  });

  switch (skin.class) {
    case 'wood': {
      (mat as unknown as { colorNode: unknown }).colorNode = woodGrainColor(
        skin.baseColor,
        darken(skin.baseColor, 0.68),
        1,
      );
      // 227 Q-A: 무광 결(roughness 0.55)은 그대로 두고 샤프한 하이라이트만 얹는
      // "니스칠한 책상". clearcoat를 0으로 내리지 말 것 — useClearcoat 게이트가
      // 뒤집혀 셰이더가 재빌드된다 (DERO-262).
      mat.clearcoat = 0.5;
      mat.clearcoatRoughness = 0.1;
      break;
    }
    case 'metal':
      mat.clearcoat = 0.15;
      mat.clearcoatRoughness = 0.25;
      break;
    case 'ceramic':
      mat.clearcoat = 0.5;
      mat.clearcoatRoughness = 0.28;
      break;
    case 'display':
      mat.clearcoat = 0.6;
      mat.clearcoatRoughness = 0.12;
      break;
    case 'glass':
      mat.transmission = 0.9;
      mat.thickness = 0.3;
      mat.ior = 1.45;
      mat.roughness = 0.06;
      break;
    case 'shade':
      mat.transmission = 0.3;
      mat.thickness = 0.15;
      mat.emissive = new THREE.Color(skin.baseColor);
      mat.emissiveIntensity = 0.0;
      break;
    case 'fabric':
    case 'plastic':
    case 'foliage':
    default:
      break;
  }
  return mat;
}
