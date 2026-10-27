package com.brunchies.dero.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * {@code POST /products/{id}/images} 요청 — 업로드가 끝난 object key를 제품에 등록한다(2단계 presign의
 * 2단계).
 *
 * <p>{@code isPrimary}가 {@code true}인데 이미 대표가 있으면 부분 유니크 인덱스
 * ({@code uq_product_image_product_id WHERE is_primary})가 저장 시점에 막는다 — WAS가 미리 세지 않는다.
 */
public record ProductImageCreateRequest(
		@NotBlank String imageKey,
		@PositiveOrZero int displayOrder,
		boolean isPrimary) {
}
