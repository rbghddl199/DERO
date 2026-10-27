package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Finish;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.RigManifest;
import java.time.OffsetDateTime;

/**
 * 등록된 에셋 1건 — {@code PUT /admin/products/{id}/asset}의 200 응답 본문.
 *
 * <p>{@code reviewStatus}·{@code verifiedAt}을 실어 보낸다 — 운영진 등록이 곧바로
 * {@code APPROVED}가 됐다는 사실을 호출부가 응답만 보고 확인할 수 있어야 한다(api-spec §9).
 */
public record AssetResponse(
		Long productId,
		String assetKey,
		GlbExportMode glbExportMode,
		Finish finish,
		RigManifest rigManifest,
		Integer polygonCount,
		ReviewStatus reviewStatus,
		OffsetDateTime verifiedAt) {

	public static AssetResponse from(Asset asset) {
		return new AssetResponse(
				asset.getProductId(),
				asset.getAssetKey(),
				asset.getGlbExportMode(),
				asset.getFinish(),
				asset.getRigManifest(),
				asset.getPolygonCount(),
				asset.getReviewStatus(),
				asset.getVerifiedAt());
	}
}
