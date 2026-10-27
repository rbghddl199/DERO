package com.brunchies.dero.product.dto;

/**
 * 전량 재색인 결과(`docs/context/api-spec.md` §9).
 *
 * @param indexedCount 색인한 제품 수 — 소프트 삭제되지 않은 전량이다
 */
public record ProductReindexResponse(long indexedCount) {
}
