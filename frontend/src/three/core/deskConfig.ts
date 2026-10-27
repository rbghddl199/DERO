// 책상 규격 정본 (설계 §2.1·§2.2) — 제품 선택 / 직접 입력 2모드가 이 타입 하나로
// 수렴한다. 렌더 경로는 desk.ts buildDesk(config) 한 개.
// NO three import (product.ts·snap.ts와 같은 규칙).

import type { DeskTexturePublicResponse } from '@/types/catalog';
import type { MaterialSkin, ProductSpec } from '../scene/product';

export type DeskMaterialId = 'walnut' | 'oak' | 'black' | 'white';
export type DeskFrameType = 't-frame' | 'four-leg' | 'top-only';

// DESK_MATERIAL_IDS(재질 선택 UI의 선택지 목록)는 DERO-335에서 삭제했다 — 재질 선택은
// 이제 `GET /desk-textures` 마스터가 채운다. DeskMaterialId 자체는 로컬 절차 카탈로그
// (three/scene/product.ts의 deskMaterialId)와 아래 DESK_SKINS 폴백으로 계속 살아 있다.
export const DESK_FRAME_TYPES: readonly DeskFrameType[] = ['t-frame', 'four-leg', 'top-only'];

export interface DeskConfig {
  /** 'product' = 제품 DB 규격(변경 불가) / 'custom' = 사용자 직접 입력 */
  source: 'product' | 'custom';
  /** source === 'product'일 때만 채워진다 */
  productId?: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  topThicknessMm: number;
  /** 엣지 마감 두께 (mm). 직접 입력 모드는 미등록 — 판정 ①이 상판 두께로 COALESCE한다 (D21) */
  edgeThicknessMm?: number;
  materialId: DeskMaterialId;
  /** desk_texture 마스터(`GET /desk-textures`)의 재질 id — 배치 저장의 정본이다.
   *  materialId(닫힌 4종)는 이 값이 없을 때만 쓰이는 로컬 절차 카탈로그용 폴백이다. */
  deskTextureId?: number;
  /** 실 카탈로그 desk_texture 재질 — 있으면 materialId(닫힌 4종)를 무시하고 이 스킨을 그대로 쓴다
   *  (desk_texture는 자유 증가 마스터라 4종에 안 갇힌다, DERO-325). */
  materialSkin?: MaterialSkin;
  frameType: DeskFrameType;
}

export interface DeskDimRange {
  min: number;
  max: number;
  default: number;
  step: number;
}

/** 직접 입력 모드 전용 범위. 제품 모드에는 적용하지 않는다 (DB가 실물). */
export const DESK_RANGE: Record<
  'widthMm' | 'depthMm' | 'heightMm' | 'topThicknessMm',
  DeskDimRange
> = {
  widthMm: { min: 100, max: 3000, default: 1400, step: 10 },
  depthMm: { min: 100, max: 1200, default: 700, step: 10 },
  heightMm: { min: 550, max: 1300, default: 740, step: 5 },
  topThicknessMm: { min: 10, max: 80, default: 25, step: 1 },
};

export const DEFAULT_CUSTOM_DESK: DeskConfig = {
  source: 'custom',
  widthMm: DESK_RANGE.widthMm.default,
  depthMm: DESK_RANGE.depthMm.default,
  heightMm: DESK_RANGE.heightMm.default,
  topThicknessMm: DESK_RANGE.topThicknessMm.default,
  materialId: 'oak',
  frameType: 'four-leg',
};

/** 재질 id -> 렌더용 PBR 스킨. materialId가 정본이고 스킨은 여기서 파생한다. */
const DESK_SKINS: Record<DeskMaterialId, MaterialSkin> = {
  walnut: { class: 'wood', baseColor: 0x6f4a30, roughness: 0.5, metalness: 0 },
  oak: { class: 'wood', baseColor: 0xb8895a, roughness: 0.55, metalness: 0 },
  black: { class: 'plastic', baseColor: 0x1e2024, roughness: 0.45, metalness: 0.05 },
  white: { class: 'plastic', baseColor: 0xeceae5, roughness: 0.5, metalness: 0.05 },
};

export function deskMaterialSkin(
  config: Pick<DeskConfig, 'materialId' | 'materialSkin'>,
): MaterialSkin {
  return config.materialSkin ?? DESK_SKINS[config.materialId];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** desk_texture 마스터 한 행 -> 렌더 스킨. 재질 마스터는 자유 증가라 DeskMaterialId 4종에 안 갇힌다
 *  — 그래서 id를 닫힌 유니온으로 되돌리는 표를 두지 않고 응답의 색·거칠기·금속성을 그대로 쓴다
 *  (DERO-335에서 임시표 DESK_TEXTURE_ID_TO_MATERIAL을 이 함수로 대체했다).
 *  baseColor가 `#rrggbb`가 아니면(데이터 오류) 오크 톤으로 떨어진다 — 씬을 죽이지 않는다. */
export function deskTextureSkin(texture: DeskTexturePublicResponse): MaterialSkin {
  return {
    class: 'wood',
    baseColor: HEX_COLOR.test(texture.baseColor)
      ? parseInt(texture.baseColor.slice(1), 16)
      : DESK_SKINS.oak.baseColor,
    roughness: texture.roughness,
    metalness: texture.metalness,
  };
}

/** 재질 목록에서 id로 찾아 스킨을 만든다. 없는 id(목록 로드 실패·삭제된 재질)는 오크 톤 폴백 —
 *  "재질을 못 찾았다"로 화면을 비우는 것보다 기본 나무 상판을 그리는 쪽이 낫다. */
export function deskSkinForTextureId(
  textures: DeskTexturePublicResponse[],
  deskTextureId: number,
): MaterialSkin {
  const texture = textures.find((t) => t.id === deskTextureId);
  return texture ? deskTextureSkin(texture) : DESK_SKINS.oak;
}

export type DeskDimKey = 'widthMm' | 'depthMm' | 'heightMm' | 'topThicknessMm';

/** 범위 위반 1건 — 화면 쪽 라벨(너비/깊이 등)로 사람이 읽을 문장을 만들 때 쓴다. */
export interface DeskDimError {
  key: DeskDimKey;
  value: number;
  min: number;
  max: number;
}

/** 직접 입력값 검증 — 범위 밖이면 어떤 필드가 왜 틀렸는지 돌려준다. */
export function validateCustomDesk(config: DeskConfig): { ok: boolean; errors: DeskDimError[] } {
  const errors: DeskDimError[] = [];
  for (const key of ['widthMm', 'depthMm', 'heightMm', 'topThicknessMm'] as const) {
    const r = DESK_RANGE[key];
    const v = config[key];
    if (!Number.isFinite(v) || v < r.min || v > r.max) {
      errors.push({ key, value: v, min: r.min, max: r.max });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 제품 DB -> 설정. 규격은 그대로 옮기고 변경하지 않는다 (설계 §2.1).
 *  materialSkin은 spec.material을 그대로 물려받는다 — mock이든 실 카탈로그(desk_texture)든
 *  이미 렌더용으로 해석된 스킨이라, deskMaterialSkin()에서 materialId(닫힌 4종) 폴백보다
 *  항상 우선한다. */
export function deskConfigFromProduct(spec: ProductSpec): DeskConfig {
  return {
    source: 'product',
    productId: spec.id,
    widthMm: spec.widthMm,
    depthMm: spec.depthMm,
    heightMm: spec.heightMm,
    topThicknessMm: spec.topThicknessMm ?? DESK_RANGE.topThicknessMm.default,
    edgeThicknessMm: spec.edgeThicknessMm,
    materialId: spec.deskMaterialId ?? 'oak',
    materialSkin: spec.material,
    frameType: spec.frameType ?? 'four-leg',
  };
}
