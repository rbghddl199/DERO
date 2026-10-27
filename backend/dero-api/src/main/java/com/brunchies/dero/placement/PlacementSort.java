package com.brunchies.dero.placement;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * {@code GET /placements}의 {@code ?sort} 값. <b>2값뿐이고 팔로잉 피드는 없다</b>(D28).
 *
 * <p>{@code @RequestParam PlacementSort}로 직접 바인딩하지 않고 {@link #from(String)}을 통과시킨다 —
 * 스프링 기본 enum 컨버터는 대소문자를 가려서 명세의 소문자 {@code ?sort=latest}가 그대로는 안 붙고,
 * 붙게 만들려면 전역 컨버터를 등록해야 한다. 값 2개짜리 파라미터 하나 때문에 전역 배선을 늘리지
 * 않는다.
 *
 * <p><b>커서 정렬키 추출이 여기 있고 Q경로 매핑은 {@code PlacementRepositoryImpl}에 있다</b> —
 * 도메인 enum에 QueryDSL을 끌어들이지 않으려고 둘로 나뉜 자리다. 정렬 축을 더하면 <b>두 곳을 같이</b>
 * 고쳐야 한다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum PlacementSort {

	LATEST("기본값. 최신순으로 created_at DESC, id DESC."),

	/**
	 * {@code like_count DESC, id DESC}. {@code idx_placement_publish_status_like_count}를 탄다.
	 *
	 * <p><b>스크롤 중 값이 변하면 항목이 밀린다</b>(ADR-0008 결정 5 "커서의 대가") — 좋아요가 늘어난
	 * 배치가 앞 페이지로 올라가면 그 자리는 건너뛴다. 정렬 스냅샷 캐시가 답이지만 그건 범위 밖이라
	 * 감수한다.
	 */
	POPULAR("인기순. like_count DESC, id DESC.");

	private final String description;

	/** {@code null}·빈 문자열은 기본값 {@link #LATEST}, 그 밖의 모르는 값은 400이다. */
	public static PlacementSort from(String value) {
		if (value == null || value.isBlank()) {
			return LATEST;
		}
		for (PlacementSort sort : values()) {
			if (sort.name().equalsIgnoreCase(value)) {
				return sort;
			}
		}
		throw new BusinessException(CommonErrorCode.INVALID_INPUT);
	}

	/** 다음 커서에 실을 이 배치의 정렬키값. 비교는 리포지토리가 같은 축으로 한다. */
	public String cursorValueOf(Placement placement) {
		return this == POPULAR
				? String.valueOf(placement.getLikeCount())
				: placement.getCreatedAt().toString();
	}
}
