package com.brunchies.dero.product.dto;

import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.SpecType;
import java.util.List;

/**
 * 제품 단건 상세 — {@code GET /products/{id}}(`docs/context/api-spec.md` §5).
 *
 * <p><b>관리자 화면도 이 응답을 쓴다</b>(같은 문서 §9) — 표현이 같고 페이지네이션이 없어 경로를
 * 나눌 이유가 없다. 그래서 {@code PENDING}/{@code REJECTED} 자작 제품은 업로더 본인 외에 ADMIN도
 * 열람한다(가시성 판정은 {@code ProductCatalogService}에 있다).
 *
 * <p><b>규격은 5칸 중 하나만 채워진다</b> — 어느 칸인지는 {@link #specType}이 말한다. 다형 응답을
 * 판별 유니온으로 표현하는 방식은 요청 쪽({@link AdminProductCreateRequest}·
 * {@link AdminProductPatchRequest})이 이미 같은 모양이라 그대로 맞췄다. 한 자리에 {@code Object}를
 * 두면 생성되는 프론트 타입이 {@code any}로 떨어진다.
 *
 * <p><b>규격 칸에 {@code XxxSpecRequest}를 그대로 재사용한다</b> — 컴포넌트가 엔티티 게터와 1:1이라
 * 응답 전용 record 5개를 새로 파면 필드가 두 벌이 되고, 규격 컬럼이 늘 때 한쪽만 고쳐도 컴파일이
 * 통과한다(조용히 갈린다). 이름의 {@code Request}는 "등록·수정이 받는 모양"이라는 뜻이고 상세는 그와
 * <b>같은 모양</b>을 돌려주는 것이 맞다 — 관리자 수정 폼이 상세를 읽어 그대로 PATCH로 되돌려 보낸다.
 *
 * <p><b>{@code asset}·{@code emitter}는 행이 없으면 {@code null}이다</b> — 책상은 절차 생성이라
 * 에셋이 없고(D18), 빛을 내지 않는 제품은 발광 행이 없다. 이미지는 없으면 빈 배열이다(프론트가 폴백
 * 아이콘을 쓴다, ADR-0011 결정 6).
 *
 * <p><b>{@code vesaSpecs}는 규격 칸이 아니라 최상위다</b>(2026-08-01). 이유 셋 — ①
 * {@code product_vesa}가 스키마상 product 레벨 정션이고(erd.md) 규격 서브타입 테이블의 컬럼이
 * 아니다 ② 응답은 id가 아니라 <b>값</b>({@code width×height})을 실어야 한다(같은 문서 §5 — 사용자용
 * {@code /vesa-specs}를 보류한 근거가 "판정에 필요한 VESA 값은 제품 응답에 실려 온다"이다)
 * ③ 위 문단대로 규격 칸은 {@code XxxSpecRequest}를 그대로 재사용하는데 요청은 id 배열이고 응답은
 * 값 객체 배열이라 한 칸에 들어가지 않는다. {@code asset}·{@code emitter}·{@code images}와 같은 칸이다.
 * <b>태깅이 없으면 빈 배열이다</b>({@code images}와 같은 규칙).
 *
 * <p>여러 소스(엔티티 + presigned URL 3종)를 합치므로 조립은 {@code from()}이 아니라 서비스가 한다
 * (규칙 11).
 */
public record ProductDetailResponse(
		Long id,
		SpecType specType,
		ProductSource source,
		Long brandId,
		String brandName,
		Long categoryId,
		String categoryName,
		String name,
		String description,
		Integer priceKrw,
		String productUrl,
		ProductStatus status,
		DeskSpecRequest desk,
		MonitorSpecRequest monitor,
		ArmSpecRequest arm,
		LightSpecRequest light,
		PropSpecRequest prop,
		AssetDetailResponse asset,
		ProductEmitterResponse emitter,
		List<ProductImageDetailResponse> images,
		List<VesaSpecResponse> vesaSpecs) {
}
