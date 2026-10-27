package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Distribution;
import com.brunchies.dero.product.EmitterShape;
import com.brunchies.dero.product.ProductEmitter;

/** 저작된 발광값 1건 — {@code PUT /admin/products/{id}/emitter}의 200 응답 본문. */
public record ProductEmitterResponse(
		Long productId,
		EmitterShape shape,
		Distribution distribution,
		int lumens,
		int radiusMm,
		boolean recolorable,
		String defaultColor,
		Integer pointXMm,
		Integer pointYMm,
		Integer pointZMm) {

	public static ProductEmitterResponse from(ProductEmitter emitter) {
		return new ProductEmitterResponse(
				emitter.getProductId(),
				emitter.getShape(),
				emitter.getDistribution(),
				emitter.getLumens(),
				emitter.getRadiusMm(),
				emitter.isRecolorable(),
				emitter.getDefaultColor(),
				emitter.getPointXMm(),
				emitter.getPointYMm(),
				emitter.getPointZMm());
	}
}
