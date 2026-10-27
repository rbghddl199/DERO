package com.brunchies.dero.commerce.dto;

/**
 * 장바구니 한 줄.
 *
 * <p><b>{@code from()} 정적 팩터리를 두지 않는다</b>(규칙 11) — {@code imageUrl}이 엔티티에 없는
 * presigned URL이라 출처가 둘이다. 조립은 서비스가 한다.
 *
 * <p><b>{@code priceKrw}는 NULL일 수 있다</b> — 자작 제품에는 가격이 없다(D20). 그때
 * {@code lineTotalKrw}는 0이고 프론트는 "가격 미등록"으로 그리면 된다.
 *
 * @param lineTotalKrw {@code priceKrw × quantity}. 합계를 프론트가 다시 곱하지 않게 서버가 낸다
 */
public record CartItemResponse(
		Long id,
		Long productId,
		String productName,
		String brandName,
		Integer priceKrw,
		String imageUrl,
		String productUrl,
		int quantity,
		long lineTotalKrw) {
}
