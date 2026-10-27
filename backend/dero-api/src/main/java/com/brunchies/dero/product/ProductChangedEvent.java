package com.brunchies.dero.product;

/**
 * 제품이 바뀌었다 — 등록·수정·삭제가 커밋된 뒤 검색 색인을 맞추라는 신호(ADR-0019 결정 3).
 *
 * <p><b>무엇이 바뀌었는지는 싣지 않는다.</b> 받는 쪽이 커밋된 상태를 DB에서 다시 읽어 "있으면 색인,
 * 없으면 제거"로 판정한다 — 이벤트에 종류를 실으면 발행부와 색인부가 각자 상태를 추측하게 되고,
 * 둘이 갈리는 순간 색인이 조용히 어긋난다.
 *
 * <p>검수(승인·반려)는 발행하지 않는다 — 색인에 실리는 값은 이름뿐이고, 검수 상태에 따른 노출은
 * Postgres 쪽 술어가 판정한다({@link com.brunchies.dero.product.service.ProductSearchService}).
 */
public record ProductChangedEvent(Long productId) {
}
