// admin — /api/v1/admin/products/{productId}/asset·emitter (ProductAssetController·
// ProductEmitterController 1:1). GLB 파일 자체는 2단계 presign으로 스토리지에 직접 올린다
// (upload-url 발급 → uploads.ts의 putToPresignedUrl → assetKey 등록).

import { adminClient } from '@/api/admin/client';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

export type AssetUploadUrlRequest = Schemas['AssetUploadUrlRequest'];
export type AssetUploadUrlResponse = Schemas['AssetUploadUrlResponse'];
export type AssetRegisterRequest = Schemas['AssetRegisterRequest'];
export type AssetResponse = Schemas['AssetResponse'];
export type RigManifest = Schemas['RigManifest'];
export type ProductEmitterRequest = Schemas['ProductEmitterRequest'];
export type ProductEmitterResponse = Schemas['ProductEmitterResponse'];

// 1단계 — contentType은 실제로 PUT할 때 붙일 헤더와 같아야 한다(서명 불일치 방지).
export function requestAssetUploadUrl(
  productId: number,
  request: AssetUploadUrlRequest,
): Promise<AssetUploadUrlResponse> {
  return adminClient.post<AssetUploadUrlResponse>(
    `/admin/products/${productId}/asset/upload-url`,
    request,
  );
}

// 2단계 — 업로드가 끝난 assetKey와 리그 매니페스트·폴리곤 수를 제품에 등록한다.
export function registerProductAsset(
  productId: number,
  request: AssetRegisterRequest,
): Promise<AssetResponse> {
  return adminClient.put<AssetResponse>(`/admin/products/${productId}/asset`, request);
}

export function registerProductEmitter(
  productId: number,
  request: ProductEmitterRequest,
): Promise<ProductEmitterResponse> {
  return adminClient.put<ProductEmitterResponse>(`/admin/products/${productId}/emitter`, request);
}

export function removeProductEmitter(productId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/products/${productId}/emitter`);
}
