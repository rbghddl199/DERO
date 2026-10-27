package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ProductImage;

/** 등록된 제품 실사 이미지 1건 — {@code POST /products/{id}/images}의 201 응답 본문. */
public record ProductImageResponse(Long id, String imageKey, int displayOrder, boolean isPrimary) {

	public static ProductImageResponse from(ProductImage image) {
		return new ProductImageResponse(
				image.getId(), image.getImageKey(), image.getDisplayOrder(), image.isPrimary());
	}
}
