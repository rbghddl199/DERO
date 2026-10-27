// 제품 카탈로그 도메인 와이어 타입 — 백엔드 DeskSummaryResponse와 1:1

import type { FrameType } from './placement';

// 책상 템플릿 목록 카드용 최소 필드(REQ-ENV-01 제품 모드) — GET /products?specType=DESK 1:1.
export interface DeskSummaryResponse {
  id: number;
  name: string;
  imageUrl: string | null;
  priceKrw: number | null;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  topThicknessMm: number;
  edgeThicknessMm: number;
  deskTextureId: number;
  frameType: FrameType;
}

// 제품 이미지 2단계 presign 업로드 — POST /products/{id}/images/upload-urls → 200.
// 대상 제품이 경로에 오므로 요청 본문엔 파일 메타만 남는다(api-spec.md §11 — 옛
// `POST /products/images/presign`은 대상이 어디에도 없어 권한 검사를 걸 자리가 없었다).
export interface ProductImageUploadUrlRequest {
  fileName: string;
  contentType: string;
}

export interface ProductImageUploadUrlResponse {
  imageKey: string;
  uploadUrl: string;
}

// 2단계 key 등록 — POST /products/{id}/images → 201 + Location.
export interface ProductImageCreateRequest {
  imageKey: string;
  displayOrder: number;
  isPrimary: boolean;
}

export interface ProductImageResponse {
  id: number;
  imageKey: string;
  displayOrder: number;
  isPrimary: boolean;
}
