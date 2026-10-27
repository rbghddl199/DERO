package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ProductImage;

/**
 * 제품 상세({@code GET /products/{id}})에 실리는 실사 이미지 1건.
 *
 * <p><b>{@link ProductImageResponse}와 따로 두는 이유</b>: 저쪽은 등록 응답이라 방금 저장한
 * {@code image_key}를 그대로 돌려주고, 이쪽은 읽는 쪽이라 <b>presigned GET URL</b>이 나간다
 * (api-spec §1 규칙 4 — 서빙 엔드포인트를 만들지 않는다). key를 상세에 실으면 프론트가 URL을 직접
 * 조립하게 되고, 그 순간 서명 규칙이 서버 밖으로 샌다.
 */
public record ProductImageDetailResponse(
		Long imageId,
		String imageUrl,
		int displayOrder,
		boolean isPrimary) {

	public static ProductImageDetailResponse from(ProductImage image, String imageUrl) {
		return new ProductImageDetailResponse(
				image.getId(), imageUrl, image.getDisplayOrder(), image.isPrimary());
	}
}
