package com.brunchies.dero.product.dto;

import jakarta.validation.constraints.NotBlank;

/** {@code POST /products/{id}/images/upload-urls} 요청 — presigned PUT URL 발급용 파일 메타. */
public record ProductImageUploadUrlRequest(
		@NotBlank String fileName,
		@NotBlank String contentType) {
}
