// 관리자 3D 에셋·발광 저작 폼의 고정 목록·기본값 — 열거는 openapi 와이어 타입에서 파생한
// 값만 쓰고, 수치(재질 PBR·빔 반각)는 코드가 정본이라 여기에 담지 않는다(erd.md `asset`·`product_emitter`).

import type { AssetDraft, EmitterDraft } from '@/types/admin/asset';
import type { SelectOption } from '@/types/admin/productForm';

/** presign 요청과 실제 PUT 헤더가 같아야 서명 검증을 통과한다. 브라우저는 .glb의 File.type을 못 채운다. */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';

export const GLB_EXPORT_MODE_OPTIONS: readonly SelectOption[] = [
  { value: 'PART_SEGMENTATION', label: '파트 분리 (PART_SEGMENTATION)' },
  { value: 'TEXTURE', label: '텍스처 융합 (TEXTURE)' },
];

export const ASSET_FINISH_OPTIONS: readonly SelectOption[] = [
  { value: 'CLEAR_ACRYLIC', label: '투명 아크릴 (CLEAR_ACRYLIC)' },
  { value: 'METALLIC', label: '메탈릭 (METALLIC)' },
  { value: 'WHITE', label: '화이트 (WHITE)' },
  { value: 'BLACK', label: '블랙 (BLACK)' },
];

export const EMITTER_SHAPE_OPTIONS: readonly SelectOption[] = [
  { value: 'POINT', label: '점광원 (POINT)' },
  { value: 'SPOT', label: '스포트 (SPOT)' },
];

export const EMITTER_DISTRIBUTION_OPTIONS: readonly SelectOption[] = [
  { value: 'SPOT', label: '집중형 (SPOT)' },
  { value: 'FLOOD', label: '확산형 (FLOOD)' },
  { value: 'AMBIENT', label: '간접광 (AMBIENT)' },
];

export const ASSET_REVIEW_STATUS_LABEL: Record<string, string> = {
  PENDING: '검수 대기 (PENDING)',
  APPROVED: '승인 (APPROVED)',
  REJECTED: '반려 (REJECTED)',
};

/** 발광색 초기값 — 사용자가 색을 고를 수 없는 제품에서는 이 값이 곧 최종색이다. */
export const DEFAULT_EMITTER_COLOR = '#ffffff';

export const EMPTY_ASSET_DRAFT: AssetDraft = {
  glbExportMode: '',
  finish: '',
  polygonCount: '',
};

export const EMPTY_EMITTER_DRAFT: EmitterDraft = {
  shape: '',
  distribution: '',
  lumens: '',
  radiusMm: '',
  recolorable: 'unset',
  defaultColor: DEFAULT_EMITTER_COLOR,
  pointXMm: '',
  pointYMm: '',
  pointZMm: '',
};
