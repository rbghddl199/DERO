package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /admin/brands/{id}/logo/upload-url} 요청 — presigned PUT URL 발급용 파일 메타.
 * {@code ProductImageUploadUrlRequest}와 같은 모양이다.
 */
public record BrandLogoUploadUrlRequest(
		@NotBlank String fileName,
		@NotBlank String contentType) {
}
