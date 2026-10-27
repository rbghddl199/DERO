// 관리자 제품 목록·검수 화면이 함께 쓰는 코드값 → 한글 라벨 표(openapi 열거값과 1:1).

import type { AssetReviewStatus } from '@/api/admin/products';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];
type AdminProductSummary = Schemas['AdminProductSummaryResponse'];

export type SpecType = NonNullable<AdminProductSummary['specType']>;
export type ProductSource = NonNullable<AdminProductSummary['source']>;
export type ProductStatus = NonNullable<AdminProductSummary['status']>;

export const SPEC_TYPE_LABEL: Record<SpecType, string> = {
  DESK: '책상',
  MONITOR: '모니터',
  ARM: '암',
  LIGHT: '조명',
  PROP: '소품',
};

export const PRODUCT_SOURCE_LABEL: Record<ProductSource, string> = {
  CATALOG: '운영진 등록',
  USER: '사용자 자작',
};

/** 카탈로그 노출 상태 — 검수 상태(asset.review_status)와 다른 축이다. */
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: '노출',
  HIDDEN: '숨김',
};

export const REVIEW_STATUS_LABEL: Record<AssetReviewStatus, string> = {
  PENDING: '검수 대기',
  APPROVED: '승인',
  REJECTED: '반려',
};

export const REVIEW_STATUS_BADGE_CLASS: Record<AssetReviewStatus, string> = {
  PENDING: 'border-warning-500/25 bg-warning-50 text-warning-700',
  APPROVED: 'border-success-500/25 bg-success-50 text-success-700',
  REJECTED: 'border-danger-500/25 bg-danger-50 text-danger-700',
};

/** 에셋 행이 아예 없는 제품 — 책상은 절차 생성이라 GLB를 올리지 않는다(D18). */
export const NO_ASSET_LABEL = '에셋 없음';

/** asset.review_note VARCHAR(500) — erd.md `asset` 절. */
export const REVIEW_NOTE_MAX_LENGTH = 500;
