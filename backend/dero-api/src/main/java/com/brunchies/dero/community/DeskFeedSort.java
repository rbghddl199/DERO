package com.brunchies.dero.community;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * {@code GET /desk-feeds}의 {@code ?sort} 값(REQ-COM-16 정렬 탭 — 최신/인기).
 * {@code PlacementSort}와 같은 이유로 {@code @RequestParam} 직접 바인딩 대신 {@link #from(String)}을
 * 통과시킨다 — 스프링 기본 enum 컨버터는 명세의 소문자 {@code ?sort=latest}를 못 받고, 값 2개짜리
 * 파라미터 하나 때문에 전역 컨버터를 늘리지 않는다.
 *
 * <p><b>커서 정렬키 추출이 여기 있고 Q경로 매핑은 {@code DeskFeedRepositoryImpl}에 있다</b> —
 * 정렬 축을 더하면 두 곳을 같이 고쳐야 한다({@code PlacementSort}와 같은 분담).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum DeskFeedSort {

	LATEST("기본값. 최신순으로 created_at DESC, id DESC."),

	/**
	 * {@code like_count DESC, id DESC}. {@code idx_desk_feed_like_count}를 탄다. 스크롤 중 값이
	 * 변하면 항목이 밀리는 대가는 {@code PlacementSort.POPULAR}와 같다(ADR-0008 결정 5).
	 */
	POPULAR("인기순. like_count DESC, id DESC.");

	private final String description;

	/** {@code null}·빈 문자열은 기본값 {@link #LATEST}, 그 밖의 모르는 값은 400이다. */
	public static DeskFeedSort from(String value) {
		if (value == null || value.isBlank()) {
			return LATEST;
		}
		for (DeskFeedSort sort : values()) {
			if (sort.name().equalsIgnoreCase(value)) {
				return sort;
			}
		}
		throw new BusinessException(CommonErrorCode.INVALID_INPUT);
	}

	/** 다음 커서에 실을 이 글의 정렬키값. 비교는 리포지토리가 같은 축으로 한다. */
	public String cursorValueOf(DeskFeed deskFeed) {
		return this == POPULAR
				? String.valueOf(deskFeed.getLikeCount())
				: deskFeed.getCreatedAt().toString();
	}
}
