package com.brunchies.dero.global.search;

/**
 * 전량 재색인 결과({@code docs/context/api-spec.md} §9).
 *
 * <p>제품({@code ProductReindexResponse})과 <b>같은 본문 모양</b>이다 — 인덱스마다 응답 필드가
 * 갈리면 운영자가 인덱스별로 다른 것을 읽어야 한다. 도메인이 늘어도 이 하나를 쓴다.
 *
 * @param indexedCount 색인한 문서 수 — 소프트 삭제되지 않은 전량이다
 */
public record ReindexResponse(long indexedCount) {
}
