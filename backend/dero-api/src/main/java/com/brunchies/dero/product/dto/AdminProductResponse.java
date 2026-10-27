package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.SpecType;

/**
 * {@code POST}/{@code PATCH /admin/products}의 응답 본문 — 등록·수정된 제품의 공통 필드.
 *
 * <p><b>{@code asset}을 담지 않는다.</b> 등록 시점엔 GLB가 아직 없다 — 에셋은 별도 경로가 붙인다
 * (검수 대상이 {@code product}인데 {@code asset} 행이 없을 수 있는 것과 같은 사실이다).
 *
 * <p><b>규격 필드도 담지 않는다.</b> 서브타입 5종을 여기 펼치면 이 record가 곧 다형 응답이 되어
 * 상세 조회({@code GET /products/{id}}, 후속 티켓)와 표현이 둘로 갈린다. 등록 응답에 필요한 것은
 * 방금 만들어진 리소스의 식별자와 공통 메타뿐이고, 규격 확인은 {@code Location}이 가리키는 상세가
 * 맡는다.
 *
 * <p>엔티티 하나에서 그대로 만들어지므로 조립이 서비스가 아니라 여기 {@code from()}에 있다(규칙 11).
 */
public record AdminProductResponse(
		Long id,
		SpecType specType,
		ProductSource source,
		Long brandId,
		Long categoryId,
		String name,
		String description,
		Integer priceKrw,
		String productUrl,
		ProductStatus status) {

	/**
	 * <b>{@code brand}·{@code category}의 id만 읽는다</b> — LAZY 프록시의 식별자 게터는 초기화를
	 * 일으키지 않아 추가 SELECT가 나가지 않는다. 이름까지 실으면 등록 응답 하나에 조회가 두 번 더 붙는다.
	 */
	public static AdminProductResponse from(Product product) {
		return new AdminProductResponse(
				product.getId(),
				SpecType.of(product),
				product.getSource(),
				product.getBrand() == null ? null : product.getBrand().getId(),
				product.getCategory() == null ? null : product.getCategory().getId(),
				product.getName(),
				product.getDescription(),
				product.getPriceKrw(),
				product.getProductUrl(),
				product.getStatus());
	}
}
