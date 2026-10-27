// admin — 마스터 데이터 6종 CRUD (/api/v1/admin/brands·categories·vibes·hashtags·
// vesa-specs·desk-textures). AdminBrandController 등 6개 컨트롤러와 1:1이며 목록은 전부
// offset 페이지(page·size), 수정은 전부 PATCH(보낸 필드만 바뀐다)다.

import { adminClient, withQuery } from '@/api/admin/client';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

/** 마스터 목록 공통 쿼리 — page는 0부터 시작한다(Spring Pageable 기본). */
export interface OffsetPageParams {
  page?: number;
  size?: number;
}

export type PageInfo = Schemas['PageInfo'];

export type BrandResponse = Schemas['BrandResponse'];
export type BrandCreateRequest = Schemas['BrandCreateRequest'];
export type BrandPatchRequest = Schemas['BrandPatchRequest'];
export type BrandLogoUploadUrlRequest = Schemas['BrandLogoUploadUrlRequest'];
export type BrandLogoUploadUrlResponse = Schemas['BrandLogoUploadUrlResponse'];
export type OffsetPageBrandResponse = Schemas['OffsetPageBrandResponse'];

export type CategoryResponse = Schemas['CategoryResponse'];
export type CategoryCreateRequest = Schemas['CategoryCreateRequest'];
export type CategoryPatchRequest = Schemas['CategoryPatchRequest'];
export type OffsetPageCategoryResponse = Schemas['OffsetPageCategoryResponse'];

export type VibeResponse = Schemas['VibeResponse'];
export type VibeCreateRequest = Schemas['VibeCreateRequest'];
export type VibePatchRequest = Schemas['VibePatchRequest'];
export type OffsetPageVibeResponse = Schemas['OffsetPageVibeResponse'];

export type HashtagResponse = Schemas['HashtagResponse'];
export type HashtagCreateRequest = Schemas['HashtagCreateRequest'];
export type HashtagPatchRequest = Schemas['HashtagPatchRequest'];
export type OffsetPageHashtagResponse = Schemas['OffsetPageHashtagResponse'];

export type VesaSpecResponse = Schemas['VesaSpecResponse'];
export type VesaSpecCreateRequest = Schemas['VesaSpecCreateRequest'];
export type VesaSpecPatchRequest = Schemas['VesaSpecPatchRequest'];
export type OffsetPageVesaSpecResponse = Schemas['OffsetPageVesaSpecResponse'];

export type DeskTextureResponse = Schemas['DeskTextureResponse'];
export type DeskTextureCreateRequest = Schemas['DeskTextureCreateRequest'];
export type DeskTexturePatchRequest = Schemas['DeskTexturePatchRequest'];
export type DeskTextureMapUploadUrlRequest = Schemas['DeskTextureMapUploadUrlRequest'];
export type DeskTextureMapUploadUrlResponse = Schemas['DeskTextureMapUploadUrlResponse'];
export type DeskTextureMapKind = DeskTextureMapUploadUrlRequest['kinds'][number];
export type OffsetPageDeskTextureResponse = Schemas['OffsetPageDeskTextureResponse'];

// --- 브랜드 ---

export function listBrands(params: OffsetPageParams = {}): Promise<OffsetPageBrandResponse> {
  return adminClient.get<OffsetPageBrandResponse>(withQuery('/admin/brands', { ...params }));
}

/** 제품 폼 선택지처럼 전체 브랜드가 필요한 화면에서 offset 페이지를 끝까지 합친다. */
export async function listAllBrands(size = 100): Promise<BrandResponse[]> {
  const brands: BrandResponse[] = [];
  let page = 0;

  while (true) {
    const response = await listBrands({ page, size });
    brands.push(...(response.content ?? []));

    const totalPages = response.page?.totalPages ?? 1;
    if (page + 1 >= totalPages) return brands;
    page += 1;
  }
}

export function createBrand(request: BrandCreateRequest): Promise<BrandResponse> {
  return adminClient.post<BrandResponse>('/admin/brands', request);
}

export function updateBrand(brandId: number, request: BrandPatchRequest): Promise<BrandResponse> {
  return adminClient.patch<BrandResponse>(`/admin/brands/${brandId}`, request);
}

export function deleteBrand(brandId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/brands/${brandId}`);
}

// 로고는 presign → 스토리지 직접 PUT → updateBrand({ logoImageKey })로 마무리한다.
export function requestBrandLogoUploadUrl(
  brandId: number,
  request: BrandLogoUploadUrlRequest,
): Promise<BrandLogoUploadUrlResponse> {
  return adminClient.post<BrandLogoUploadUrlResponse>(
    `/admin/brands/${brandId}/logo/upload-url`,
    request,
  );
}

// --- 카테고리 ---

export function listCategories(params: OffsetPageParams = {}): Promise<OffsetPageCategoryResponse> {
  return adminClient.get<OffsetPageCategoryResponse>(withQuery('/admin/categories', { ...params }));
}

/** 제품 목록·폼처럼 전체 카테고리가 필요한 화면에서 offset 페이지를 끝까지 합친다. */
export async function listAllCategories(size = 100): Promise<CategoryResponse[]> {
  const categories: CategoryResponse[] = [];
  let page = 0;

  while (true) {
    const response = await listCategories({ page, size });
    categories.push(...(response.content ?? []));

    const totalPages = response.page?.totalPages ?? 1;
    if (page + 1 >= totalPages) return categories;
    page += 1;
  }
}

export function createCategory(request: CategoryCreateRequest): Promise<CategoryResponse> {
  return adminClient.post<CategoryResponse>('/admin/categories', request);
}

export function updateCategory(
  categoryId: number,
  request: CategoryPatchRequest,
): Promise<CategoryResponse> {
  return adminClient.patch<CategoryResponse>(`/admin/categories/${categoryId}`, request);
}

export function deleteCategory(categoryId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/categories/${categoryId}`);
}

// --- 무드(vibe) ---

export function listVibes(params: OffsetPageParams = {}): Promise<OffsetPageVibeResponse> {
  return adminClient.get<OffsetPageVibeResponse>(withQuery('/admin/vibes', { ...params }));
}

export function createVibe(request: VibeCreateRequest): Promise<VibeResponse> {
  return adminClient.post<VibeResponse>('/admin/vibes', request);
}

export function updateVibe(vibeId: number, request: VibePatchRequest): Promise<VibeResponse> {
  return adminClient.patch<VibeResponse>(`/admin/vibes/${vibeId}`, request);
}

export function deleteVibe(vibeId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/vibes/${vibeId}`);
}

// --- 해시태그 ---

export function listHashtags(params: OffsetPageParams = {}): Promise<OffsetPageHashtagResponse> {
  return adminClient.get<OffsetPageHashtagResponse>(withQuery('/admin/hashtags', { ...params }));
}

export function createHashtag(request: HashtagCreateRequest): Promise<HashtagResponse> {
  return adminClient.post<HashtagResponse>('/admin/hashtags', request);
}

export function updateHashtag(
  hashtagId: number,
  request: HashtagPatchRequest,
): Promise<HashtagResponse> {
  return adminClient.patch<HashtagResponse>(`/admin/hashtags/${hashtagId}`, request);
}

export function deleteHashtag(hashtagId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/hashtags/${hashtagId}`);
}

// --- VESA 규격 ---

export function listVesaSpecs(params: OffsetPageParams = {}): Promise<OffsetPageVesaSpecResponse> {
  return adminClient.get<OffsetPageVesaSpecResponse>(withQuery('/admin/vesa-specs', { ...params }));
}

export function createVesaSpec(request: VesaSpecCreateRequest): Promise<VesaSpecResponse> {
  return adminClient.post<VesaSpecResponse>('/admin/vesa-specs', request);
}

export function updateVesaSpec(
  vesaSpecId: number,
  request: VesaSpecPatchRequest,
): Promise<VesaSpecResponse> {
  return adminClient.patch<VesaSpecResponse>(`/admin/vesa-specs/${vesaSpecId}`, request);
}

export function deleteVesaSpec(vesaSpecId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/vesa-specs/${vesaSpecId}`);
}

// --- 책상 재질 ---

export function listDeskTextures(
  params: OffsetPageParams = {},
): Promise<OffsetPageDeskTextureResponse> {
  return adminClient.get<OffsetPageDeskTextureResponse>(
    withQuery('/admin/desk-textures', { ...params }),
  );
}

export function createDeskTexture(request: DeskTextureCreateRequest): Promise<DeskTextureResponse> {
  return adminClient.post<DeskTextureResponse>('/admin/desk-textures', request);
}

export function updateDeskTexture(
  deskTextureId: number,
  request: DeskTexturePatchRequest,
): Promise<DeskTextureResponse> {
  return adminClient.patch<DeskTextureResponse>(`/admin/desk-textures/${deskTextureId}`, request);
}

export function deleteDeskTexture(deskTextureId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/desk-textures/${deskTextureId}`);
}

// 알베도·러프니스·노멀 맵을 한 번에 presign 받는다 — 올린 뒤 updateDeskTexture로 key를 등록한다.
export function requestDeskTextureMapUploadUrls(
  deskTextureId: number,
  request: DeskTextureMapUploadUrlRequest,
): Promise<DeskTextureMapUploadUrlResponse> {
  return adminClient.post<DeskTextureMapUploadUrlResponse>(
    `/admin/desk-textures/${deskTextureId}/map-upload-urls`,
    request,
  );
}
