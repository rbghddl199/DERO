// 관리자 3D 에셋·발광 저작 폼의 입력 초안 타입 — 입력 중에는 전부 문자열이고, 제출 직전에
// openapi 와이어 타입(AssetRegisterRequest·ProductEmitterRequest)으로 변환한다. boolean은
// "미선택"을 표현해야 해서 3지 선택값(BooleanChoice)으로 들고 있다(erd.md 전역 규칙).

import type { BooleanChoice } from '@/types/admin/productForm';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

export type AssetRegisterRequest = Schemas['AssetRegisterRequest'];
export type AssetDetailResponse = Schemas['AssetDetailResponse'];
export type ProductEmitterRequest = Schemas['ProductEmitterRequest'];
export type ProductEmitterResponse = Schemas['ProductEmitterResponse'];

/** 와이어의 리그 매니페스트 — 필드가 전부 옵셔널이라 3D 런타임 타입과 이름이 같아도 다른 타입이다. */
export type WireRigManifest = Schemas['RigManifest'];

export type GlbExportMode = AssetRegisterRequest['glbExportMode'];
export type AssetFinish = NonNullable<AssetRegisterRequest['finish']>;
export type AssetReviewStatus = NonNullable<AssetDetailResponse['reviewStatus']>;
export type EmitterShape = ProductEmitterRequest['shape'];
export type EmitterDistribution = NonNullable<ProductEmitterRequest['distribution']>;

export type AssetDraft = {
  glbExportMode: GlbExportMode | '';
  /** PART_SEGMENTATION일 때만 값이 있다 — TEXTURE는 GLB 자신이 재질 정본이라 비운다. */
  finish: AssetFinish | '';
  polygonCount: string;
};

export type EmitterDraft = {
  shape: EmitterShape | '';
  /** shape=SPOT일 때만 값이 있다 — POINT에는 조일 원뿔이 없다. */
  distribution: EmitterDistribution | '';
  lumens: string;
  radiusMm: string;
  recolorable: BooleanChoice;
  defaultColor: string;
  /** 셋 다 채우거나 셋 다 비우거나 — 비우면 런타임이 bbox 중심으로 폴백한다. */
  pointXMm: string;
  pointYMm: string;
  pointZMm: string;
};
