package com.brunchies.dero.product.dto;

import java.util.List;

/**
 * 검색어 추천 결과(`docs/context/api-spec.md` §5).
 *
 * @param suggestions 입력창 아래에 세울 추천어 — 관련도 순이고, 전부 <b>실제로 검색되는</b> 제품
 *         이름이다(숨김·검수 대기 제품은 빠진다)
 */
public record ProductSuggestionsResponse(List<String> suggestions) {
}
