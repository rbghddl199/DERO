package com.brunchies.dero.community.dto;

/**
 * 내가 찜한 제품 목록의 한 줄 — 찜 행 id(커서)와 제품 id뿐이다(DERO-356).
 *
 * <p><b>왜 엔티티가 아니라 프로젝션인가</b>(ADR-0018 결정 1의 기본은 엔티티다 — 벗어난 이유를 적는다):
 * {@code ProductLike}를 엔티티로 읽고 {@code getProduct()}를 부르면 <b>다형 루트 {@code Product}의
 * LAZY 프록시</b>가 영속성 컨텍스트에 등록된다. 그러면 뒤이어 제품을 다시 읽어도 Hibernate가 같은
 * 식별자에 대해 <b>그 프록시를 돌려주고</b>, {@code product instanceof Desk}가 거짓이 되어 규격이
 * 통째로 빠진다 — 실제로 그 경로로 {@code PRODUCT_UNKNOWN_SPEC_SUBTYPE}이 났다.
 *
 * <p><b>지금은 {@code Product}에 {@code @ConcreteProxy}가 붙어 프록시여도 구체 타입으로 해석된다</b>
 * (2026-08-02, DERO-373 — {@code product/CLAUDE.md} "다형 루트에 대한 lazy 프록시" 항목).
 * 그래도 이 프로젝션을 되돌리지 않는다: id 둘만 읽으면 프록시가 <b>아예 안 생기고</b>, 안 만드는 쪽이
 * 여전히 제일 싸다.
 */
public record LikedProductRow(Long likeId, Long productId) {
}
