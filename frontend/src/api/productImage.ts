// 제품 이미지 2단계 presign 업로드 API — POST /api/v1/products/{id}/images/upload-urls(발급) →
// 스토리지 직접 PUT → POST /api/v1/products/{id}/images(key 등록). ProductImageController 1:1.
import { apiClient } from './client';
import type {
  ProductImageCreateRequest,
  ProductImageResponse,
  ProductImageUploadUrlRequest,
  ProductImageUploadUrlResponse,
} from '@/types/product';

// 1단계 — 대상 제품이 경로에 온다(옛 /products/images/presign은 대상이 없어 폐기됐다).
export async function requestProductImageUploadUrl(
  productId: number,
  request: ProductImageUploadUrlRequest,
): Promise<ProductImageUploadUrlResponse> {
  return apiClient.post<ProductImageUploadUrlResponse>(
    `/products/${productId}/images/upload-urls`,
    request,
  );
}

// presigned URL로 파일을 S3에 직접 PUT — 백엔드를 거치지 않는다.
export async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`S3 업로드에 실패했습니다. (status: ${response.status})`);
  }
}

// 2단계 — 업로드가 끝난 key를 제품에 등록한다(201 + Location).
export async function registerProductImage(
  productId: number,
  request: ProductImageCreateRequest,
): Promise<ProductImageResponse> {
  return apiClient.post<ProductImageResponse>(`/products/${productId}/images`, request);
}
