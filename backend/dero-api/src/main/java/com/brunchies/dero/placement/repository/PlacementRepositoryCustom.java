package com.brunchies.dero.placement.repository;

import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.PublishStatus;
import java.util.List;
import org.springframework.data.domain.Limit;

/**
 * {@link PlacementRepository}의 QueryDSL 커스텀 프래그먼트 — {@code GET /placements} 목록 하나가
 * 필터 6종({@code owner}·{@code publishStatus}·{@code ids}·{@code hashtag}·리믹스 출처·북마크) ·
 * 정렬 2종 · 복합
 * 커서를 전부 동적으로 조합하므로 JPQL 문자열로는 성립하지 않는다(querydsl-rubric §2 하드 트리거
 * 4개 해당).
 *
 * <p><b>{@code bookmarkedIds}는 id 목록으로 들어온다</b> — {@code placement_bookmark}가
 * {@code community} 애그리거트라 이 쿼리가 조인으로 내려갈 수 없다(ADR-0007 결정 7의 의존 방향).
 * 사유와 대가는 {@link PlacementRepository#findAllBookmarkRows}의 Javadoc.
 * {@code null}이 "필터 없음"이고 <b>빈 목록은 "하나도 안 맞음"</b>이라 서로 다른 뜻이다.
 *
 * <p>형태는 {@code ProductRepositoryCustom}/{@code ProductRepositoryImpl}을 그대로 따른다
 * (architecture.md 규칙 20).
 */
public interface PlacementRepositoryCustom {

	/**
	 * 목록 한 페이지. <b>{@code viewerId}는 nullable이고 그게 곧 비로그인이다</b> — 가시성 조건은
	 * {@link PlacementRepositoryImpl}이 이 메서드와 {@link #countVisible} 양쪽에 같은 헬퍼로 건다.
	 *
	 * @param cursor {@code null}이면 첫 페이지
	 */
	List<Placement> findVisiblePage(Long viewerId, Long ownerId, PublishStatus publishStatus,
			List<Long> ids, String hashtagName, Long sourcePlacementId, List<Long> bookmarkedIds,
			PlacementSort sort, CursorCodec.Composite cursor, Limit limit);

	/** {@code CursorPage.totalCount()}용 — {@link #findVisiblePage}와 같은 필터(커서 제외). */
	long countVisible(Long viewerId, Long ownerId, PublishStatus publishStatus, List<Long> ids,
			String hashtagName, Long sourcePlacementId, List<Long> bookmarkedIds);

	/**
	 * 검색 경로 — ES가 준 id들 중 <b>실제로 보여도 되는 배치</b>만 돌려준다(ADR-0019 결정 4 ·
	 * ADR-0027 결정 4). 가시성({@code PUBLIC} + 본인 소유)과 나머지 필터는 목록과 <b>같은 술어</b>를
	 * 그대로 탄다 — 그래서 색인에 있는 {@code PRIVATE} 배치가 남의 검색 결과에 뜨지 않는다.
	 *
	 * <p><b>순서는 보장하지 않는다</b> — 관련도 순서는 ES가 정하고 호출부가 id 순서대로 다시 세운다.
	 * 개수도 여기서 세지 않는다: 걸러 낸 목록이 이미 손에 있어 추가 쿼리가 필요 없다.
	 */
	List<Placement> findAllVisibleByIds(List<Long> hitIds, Long viewerId, Long ownerId,
			PublishStatus publishStatus, List<Long> ids, String hashtagName,
			List<Long> bookmarkedIds);
}
