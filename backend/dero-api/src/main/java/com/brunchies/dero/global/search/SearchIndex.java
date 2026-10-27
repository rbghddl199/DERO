package com.brunchies.dero.global.search;

import java.util.Locale;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 검색 대상. {@link SearchEventLogger#INDEX_FIELD}에 실려 대시보드가 도메인별로 집계를 가르는 값이다.
 *
 * <p><b>문자열이 아니라 열거형인 이유</b>는 이 값이 ES 매핑·Kibana 패널과 공유하는 계약이라서다 —
 * 호출부에서 {@code "product"}로 한 글자만 어긋나도 아무것도 빨개지지 않고 그 도메인 검색어만 표에서
 * 조용히 빠진다({@code SearchEventLogger}의 필드 상수와 같은 함정).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum SearchIndex {

	PRODUCTS("제품 검색. `GET /products?q=`."),
	PLACEMENTS("배치(데스크 피드) 검색."),
	POSTS("커뮤니티 게시글 검색.");

	private final String description;

	/**
	 * 로그에 싣는 값. 색인 별칭과 같은 소문자 복수형이다({@code products}·{@code placements}·
	 * {@code posts}).
	 */
	public String fieldValue() {
		return name().toLowerCase(Locale.ROOT);
	}
}
