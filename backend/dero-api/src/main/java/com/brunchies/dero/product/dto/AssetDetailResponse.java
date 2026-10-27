package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Finish;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.RigManifest;

/**
 * 제품 상세({@code GET /products/{id}})에 실리는 GLB 에셋. {@code asset} 행이 없는 제품(책상은 절차
 * 생성이라 애초에 없다 — D18)에서는 상세 응답의 이 필드가 통째로 {@code null}이다.
 *
 * <p><b>{@link AssetResponse}와 따로 두는 이유</b>: 저쪽은 등록 응답이라 방금 저장한
 * {@code asset_key}를 그대로 돌려주지만(등록자가 자기가 보낸 key가 저장됐음을 확인하는 자리),
 * 이쪽은 읽는 쪽이라 <b>key가 아니라 presigned GET URL</b>이 나가야 한다(api-spec §1 규칙 4 —
 * 서빙 엔드포인트를 만들지 않고 URL을 리소스 응답에 싣는다). {@code reviewNote}도 이쪽에만 있다:
 * 반려 사유는 업로더가 상세에서 읽어야 고칠 수 있다.
 *
 * <p><b>그럼에도 {@code assetKey}를 같이 싣는다</b> — {@code PUT /admin/products/{id}/asset}의
 * {@code AssetRegisterRequest.assetKey}가 필수라(그 레코드의 {@code @NotBlank}), 응답에 key가 없으면
 * {@code finish}·{@code rigManifest} 같은 메타데이터만 고치는 수정에도 GLB를 다시 업로드해서 새 key를
 * 만들어야 한다. presigned GET URL은 만료되는 조회용이라 그 자리에 되돌려 보낼 수 없다. 프론트가 상세에서
 * 읽은 key를 그대로 PUT에 실어 보내는 경로를 여는 것이 이 필드의 유일한 용도다.
 *
 * <p><b>익명·비관리자 응답에서는 {@code assetKey}가 {@code null}이다</b> — 왕복 용도는 관리자 PUT
 * 뿐이라(위 문단) 그 경로가 없는 호출자에게 object storage key를 원본 그대로 내보낼 이유가 없다.
 * {@code from(asset, assetUrl, includeKey)}의 {@code includeKey}가 그 경계다.
 *
 * <p>URL 조립은 {@code PresignPort}가 하므로 소스가 둘이다 — {@code UserMeResponse.from(user, url)}과
 * 같은 2-인자 팩터리 형태다(규칙 11).
 */
public record AssetDetailResponse(
		String assetKey,
		String assetUrl,
		GlbExportMode glbExportMode,
		Finish finish,
		RigManifest rigManifest,
		Integer polygonCount,
		ReviewStatus reviewStatus,
		String reviewNote) {

	public static AssetDetailResponse from(Asset asset, String assetUrl, boolean includeKey) {
		return new AssetDetailResponse(
				includeKey ? asset.getAssetKey() : null,
				assetUrl,
				asset.getGlbExportMode(),
				asset.getFinish(),
				asset.getRigManifest(),
				asset.getPolygonCount(),
				asset.getReviewStatus(),
				asset.getReviewNote());
	}
}
