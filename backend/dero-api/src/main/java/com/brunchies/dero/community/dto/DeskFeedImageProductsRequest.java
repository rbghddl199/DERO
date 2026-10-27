package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 사진 한 장의 제품 태그 <b>전체 교체</b> 요청(D37 개정·ADR-0040). 빈 배열이 곧 "태그 없음"이라
 * {@code null}은 받지 않는다 — "안 건드림"과 "다 뗌"이 갈리면 호출부마다 다르게 읽는다(수정
 * {@code PUT}의 {@code placementId}가 겪은 자리와 같은 이유).
 *
 * <p><b>상한을 여기서 걸지 않는다</b> — 사진별 상한은 없고(ADR-0040 결정 2), 실질 천장은 글 단위
 * 목록 ≤10이다. 그 밖의 제품은 서비스가 422로 거부한다.
 */
public record DeskFeedImageProductsRequest(@NotNull List<Long> productIds) {

	public List<Long> productIdsOrEmpty() {
		return productIds == null ? List.of() : productIds;
	}
}
