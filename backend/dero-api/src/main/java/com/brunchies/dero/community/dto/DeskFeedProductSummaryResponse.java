package com.brunchies.dero.community.dto;

/**
 * 상세 하단 "사용된 제품" 카드 한 장(ADR-0034 결정 5). 클릭하면 <b>내부 링크
 * {@code /product/{id}}</b>로 이동한다 — 외부(쿠팡류) 링크가 아니라 우리 제품 상세다.
 *
 * <p>{@code imageUrl}은 제품 대표 이미지({@code product_image.is_primary})의 presigned GET URL이고
 * 없으면 {@code null}이다. {@code priceKrw}도 <b>NULL일 수 있다</b> — 자작 제품에는 가격이 없다
 * (D20, {@code CartItemResponse}와 같은 계약).
 *
 * <p><b>소프트 삭제된 제품은 이 목록에 실리지 않는다</b> — 정션 행은 남기고 화면만 숨긴다(첨부
 * 배치 카드와 같은 규칙). 목록 카드({@link DeskFeedSummaryResponse})에는 아예 싣지 않는다.
 */
public record DeskFeedProductSummaryResponse(
		Long id, String name, Integer priceKrw, String imageUrl) {
}
