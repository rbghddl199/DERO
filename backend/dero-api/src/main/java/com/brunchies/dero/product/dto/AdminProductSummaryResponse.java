package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import java.time.OffsetDateTime;

/**
 * {@code GET /admin/products} 목록 한 줄(REQ-ADM-04 검수 대기 목록).
 *
 * <p><b>엔티티를 통째로 읽지 않고 QueryDSL 생성자 프로젝션으로 뽑는다</b> — {@code Product.asset}·
 * {@code Product.emitter}는 NULL일 수 있는 역방향 1:1이라 프록시를 만들 수 없고, 엔티티를 로드하면
 * <b>행마다 SELECT가 2개씩 더 나간다</b>({@code product/CLAUDE.md}). 100줄짜리 관리자 목록이면
 * 부수 쿼리가 200개다.
 *
 * <p><b>검수 3필드가 전부 nullable이다.</b> 책상은 절차 생성이라 {@code asset} 행이 아예 없고(D18)
 * 운영진 등록 직후에도 GLB가 아직 안 붙었을 수 있다 — 목록은 그 상태를 그대로 보여줘야 한다
 * ({@code null} = 검수 대상 아님/아직 없음).
 */
public record AdminProductSummaryResponse(
		Long id,
		SpecType specType,
		String name,
		ProductSource source,
		ProductStatus status,
		Integer priceKrw,
		String brandName,
		String categoryName,
		ReviewStatus reviewStatus,
		String reviewNote,
		OffsetDateTime verifiedAt,
		OffsetDateTime createdAt) {
}
