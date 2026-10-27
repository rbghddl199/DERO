// admin — /api/v1/admin/products (AdminProductController 1:1). 상세 조회·대표 이미지 지정은
// 공용 /products 경로지만 관리자 화면만 쓰는 호출이라 여기 둔다.

import { adminClient, withQuery } from '@/api/admin/client';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

export type AdminProductSummaryResponse = Schemas['AdminProductSummaryResponse'];
export type OffsetPageAdminProductSummaryResponse =
  Schemas['OffsetPageAdminProductSummaryResponse'];
export type AdminProductResponse = Schemas['AdminProductResponse'];
export type AdminProductCreateRequest = Schemas['AdminProductCreateRequest'];
export type AdminProductPatchRequest = Schemas['AdminProductPatchRequest'];
export type AdminProductReviewRequest = Schemas['AdminProductReviewRequest'];
export type ProductDetailResponse = Schemas['ProductDetailResponse'];

/** GET /admin/products의 status 필터 — 에셋 검수 상태다(제품 노출 상태 ACTIVE/HIDDEN이 아니다). */
export type AssetReviewStatus = NonNullable<AdminProductSummaryResponse['reviewStatus']>;

export interface AdminProductListParams {
  status?: AssetReviewStatus;
  brandId?: number;
  categoryId?: number;
  keyword?: string;
  /** offset 페이지 번호 — 0부터 시작한다(Spring Pageable 기본). */
  page?: number;
  size?: number;
}

export function listAdminProducts(
  params: AdminProductListParams = {},
): Promise<OffsetPageAdminProductSummaryResponse> {
  return adminClient.get<OffsetPageAdminProductSummaryResponse>(
    withQuery('/admin/products', {
      status: params.status,
      brandId: params.brandId,
      categoryId: params.categoryId,
      keyword: params.keyword,
      page: params.page,
      size: params.size,
    }),
  );
}

export function createAdminProduct(
  request: AdminProductCreateRequest,
): Promise<AdminProductResponse> {
  return adminClient.post<AdminProductResponse>('/admin/products', request);
}

export function updateAdminProduct(
  productId: number,
  request: AdminProductPatchRequest,
): Promise<AdminProductResponse> {
  return adminClient.patch<AdminProductResponse>(`/admin/products/${productId}`, request);
}

export function deleteAdminProduct(productId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/products/${productId}`);
}

// 에셋 검수 판정 — APPROVED/REJECTED와 사유 메모를 남긴다.
export function reviewAdminProduct(
  productId: number,
  request: AdminProductReviewRequest,
): Promise<void> {
  return adminClient.put<void>(`/admin/products/${productId}/review`, request);
}

// 공용 상세 경로 — 규격·에셋·발광·이미지가 한 번에 온다(관리자 수정 화면의 초기값).
export function getAdminProductDetail(productId: number): Promise<ProductDetailResponse> {
  return adminClient.get<ProductDetailResponse>(`/products/${productId}`);
}

export function designatePrimaryProductImage(productId: number, imageId: number): Promise<void> {
  return adminClient.put<void>(`/products/${productId}/images/${imageId}/primary`);
}

// 이미지 1장 삭제(204). 대표를 지운 뒤 대표가 남아 있는지는 삭제 후 상세를 다시 읽어 판단한다
// — 화면이 응답을 믿지 않고 재조회 결과로 "대표 없음"을 안내한다.
export function deleteProductImage(productId: number, imageId: number): Promise<void> {
  return adminClient.delete<void>(`/products/${productId}/images/${imageId}`);
}

// --- 제품 실사 이미지 2단계 업로드 ---
// 공용 경로지만 관리자 화면이 쓰므로 Bearer가 붙는 adminClient로 부른다. 실제 파일 전송은
// presigned URL로 스토리지에 직접 PUT한다(uploads.ts의 putToPresignedUrl).

export type ProductImageUploadUrlRequest = Schemas['ProductImageUploadUrlRequest'];
export type ProductImageUploadUrlResponse = Schemas['ProductImageUploadUrlResponse'];
export type ProductImageCreateRequest = Schemas['ProductImageCreateRequest'];
export type ProductImageResponse = Schemas['ProductImageResponse'];

export function requestProductImageUploadUrl(
  productId: number,
  request: ProductImageUploadUrlRequest,
): Promise<ProductImageUploadUrlResponse> {
  return adminClient.post<ProductImageUploadUrlResponse>(
    `/products/${productId}/images/upload-urls`,
    request,
  );
}

export function registerProductImage(
  productId: number,
  request: ProductImageCreateRequest,
): Promise<ProductImageResponse> {
  return adminClient.post<ProductImageResponse>(`/products/${productId}/images`, request);
}
