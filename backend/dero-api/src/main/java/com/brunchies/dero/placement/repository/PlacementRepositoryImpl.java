package com.brunchies.dero.placement.repository;

import static com.brunchies.dero.catalog.QHashtag.hashtag;
import static com.brunchies.dero.placement.QPlacement.placement;
import static com.brunchies.dero.placement.QPlacementHashtag.placementHashtag;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.PublishStatus;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;

/**
 * {@link PlacementRepositoryCustom} 구현 — QueryDSL(ADR-0018 결정 2).
 *
 * <p><b>가시성 조건은 {@link #visibleTo}에만 있다.</b> 목록과 총 개수가 같은 헬퍼를 부르므로 한쪽만
 * 빠뜨릴 수가 없다 — 실제로 옛 {@code findSummaries}가 {@code deleted_at is null}뿐이라 남의 비공개
 * 배치를 통째로 흘리던 자리다({@code docs/context/api-spec.md} §4). 필터 3종보다 <b>먼저</b>가 아니라
 * <b>항상 함께</b> AND로 걸리는 게 요점이다: {@code ?owner=<남의 id>&publishStatus=PRIVATE}는 두
 * 조건이 서로를 배제해 빈 결과가 된다.
 */
@RequiredArgsConstructor
public class PlacementRepositoryImpl implements PlacementRepositoryCustom {

	private final JPAQueryFactory queryFactory;

	@Override
	public List<Placement> findVisiblePage(Long viewerId, Long ownerId, PublishStatus publishStatus,
			List<Long> ids, String hashtagName, Long sourcePlacementId, List<Long> bookmarkedIds,
			PlacementSort sort, CursorCodec.Composite cursor, Limit limit) {
		return queryFactory.selectFrom(placement)
				// 작성자 닉네임을 목록에 실어야 한다. to-one이라 limit과 같이 써도 행이 안 늘고,
				// 안 걸면 20건짜리 페이지가 SELECT 20개를 더 낸다(query-conventions §2).
				.leftJoin(placement.user).fetchJoin()
				.where(
						placement.deletedAt.isNull(),
						visibleTo(viewerId),
						ownerEq(ownerId),
						publishStatusEq(publishStatus),
						idIn(ids),
						hashtagNamed(hashtagName),
						sourcePlacementEq(sourcePlacementId),
						bookmarkedIn(bookmarkedIds),
						cursorAfter(sort, cursor))
				.orderBy(orderOf(sort))
				.limit(limit.max())
				.fetch();
	}

	@Override
	public long countVisible(Long viewerId, Long ownerId, PublishStatus publishStatus,
			List<Long> ids, String hashtagName, Long sourcePlacementId, List<Long> bookmarkedIds) {
		Long count = queryFactory.select(placement.count())
				.from(placement)
				.where(
						placement.deletedAt.isNull(),
						visibleTo(viewerId),
						ownerEq(ownerId),
						publishStatusEq(publishStatus),
						idIn(ids),
						hashtagNamed(hashtagName),
						sourcePlacementEq(sourcePlacementId),
						bookmarkedIn(bookmarkedIds))
				.fetchOne();
		return count == null ? 0 : count;
	}

	@Override
	public List<Placement> findAllVisibleByIds(List<Long> hitIds, Long viewerId, Long ownerId,
			PublishStatus publishStatus, List<Long> ids, String hashtagName,
			List<Long> bookmarkedIds) {
		if (hitIds.isEmpty()) {
			return List.of();
		}
		return queryFactory.selectFrom(placement)
				.leftJoin(placement.user).fetchJoin()
				.where(
						placement.id.in(hitIds),
						placement.deletedAt.isNull(),
						visibleTo(viewerId),
						ownerEq(ownerId),
						publishStatusEq(publishStatus),
						idIn(ids),
						hashtagNamed(hashtagName),
						bookmarkedIn(bookmarkedIds))
				.fetch();
	}

	/**
	 * 비로그인은 {@link PublishStatus#PUBLIC}만, 로그인은 거기에 본인 소유가 더해진다.
	 *
	 * <p><b>{@code viewerId}가 NULL이면 소유 항을 아예 붙이지 않는다</b> — 붙이고 3값 논리에 맡기면
	 * {@code placement.user}가 NULL인 배치(작성자 탈퇴, {@code ON DELETE SET NULL})에서
	 * {@code NULL = NULL}이 되어 익명 호출자가 주인 없는 비공개 배치의 주인으로 통과할 여지가 남는다
	 * ({@code placement/CLAUDE.md}).
	 */
	private BooleanExpression visibleTo(Long viewerId) {
		BooleanExpression isPublic = placement.publishStatus.eq(PublishStatus.PUBLIC);
		return viewerId == null ? isPublic : isPublic.or(placement.user.id.eq(viewerId));
	}

	private BooleanExpression ownerEq(Long ownerId) {
		return ownerId == null ? null : placement.user.id.eq(ownerId);
	}

	private BooleanExpression publishStatusEq(PublishStatus publishStatus) {
		return publishStatus == null ? null : placement.publishStatus.eq(publishStatus);
	}

	private BooleanExpression idIn(List<Long> ids) {
		return ids == null || ids.isEmpty() ? null : placement.id.in(ids);
	}

	/**
	 * 태그 칩 필터({@code ?hashtag=}). <b>조인이 아니라 {@code exists} 서브쿼리다</b> — 정션을 join하면
	 * 태그가 여러 개인 배치가 결과에 중복으로 실려 커서 페이지 크기가 조용히 어긋난다. {@code distinct}로
	 * 덮으면 {@code left join fetch}와 같이 쓸 때 다시 문제가 되고, 존재 여부만 물으면 행 수가 안 변한다
	 * ({@code PostRepositoryImpl.hashtagNamed}와 글자 그대로 같은 형태 — 두 목록이 같은 태그에 다르게
	 * 답하면 안 된다).
	 */
	private BooleanExpression hashtagNamed(String hashtagName) {
		if (hashtagName == null || hashtagName.isBlank()) {
			return null;
		}
		return JPAExpressions.selectOne()
				.from(placementHashtag)
				.join(placementHashtag.hashtag, hashtag)
				.where(placementHashtag.placement.eq(placement), hashtag.deletedAt.isNull(),
						hashtag.name.eq(hashtagName))
				.exists();
	}

	/** {@code GET /placements/{id}/remixes} — 이 배치를 출처로 삼는 것들. */
	private BooleanExpression sourcePlacementEq(Long sourcePlacementId) {
		return sourcePlacementId == null
				? null
				: placement.sourcePlacement.id.eq(sourcePlacementId);
	}

	/**
	 * {@code ?bookmarked=me}. <b>{@link #idIn}과 달리 빈 목록을 "필터 없음"으로 접지 않는다</b> —
	 * 하나도 안 담은 사용자가 피드 전체를 받으면 그게 사고다. {@code null}만 필터 없음이다.
	 */
	private BooleanExpression bookmarkedIn(List<Long> bookmarkedIds) {
		if (bookmarkedIds == null) {
			return null;
		}
		return bookmarkedIds.isEmpty() ? placement.id.isNull() : placement.id.in(bookmarkedIds);
	}

	/**
	 * 키셋 조건 — {@code 정렬키 < 커서} 또는 {@code 정렬키 = 커서 AND id < 커서id}. 동점 구간을 id로
	 * 갈라야 커서가 항목을 건너뛰거나 두 번 보여주지 않는다.
	 */
	private BooleanExpression cursorAfter(PlacementSort sort, CursorCodec.Composite cursor) {
		if (cursor == null) {
			return null;
		}
		if (sort == PlacementSort.POPULAR) {
			int likeCount = parseInt(cursor.sortValue());
			return placement.likeCount.lt(likeCount)
					.or(placement.likeCount.eq(likeCount).and(placement.id.lt(cursor.id())));
		}
		OffsetDateTime createdAt = parseCreatedAt(cursor.sortValue());
		return placement.createdAt.lt(createdAt)
				.or(placement.createdAt.eq(createdAt).and(placement.id.lt(cursor.id())));
	}

	/** 정렬 축의 Q경로 매핑. 값 자체의 매핑은 {@link PlacementSort#cursorValueOf}에 있다. */
	private OrderSpecifier<?>[] orderOf(PlacementSort sort) {
		return sort == PlacementSort.POPULAR
				? new OrderSpecifier<?>[] {placement.likeCount.desc(), placement.id.desc()}
				: new OrderSpecifier<?>[] {placement.createdAt.desc(), placement.id.desc()};
	}

	private int parseInt(String sortValue) {
		try {
			return Integer.parseInt(sortValue);
		} catch (NumberFormatException e) {
			// 손으로 만든 커서이거나 sort를 바꾼 채 옛 커서를 되보낸 요청 — 400으로 번역한다(규칙 8).
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}

	private OffsetDateTime parseCreatedAt(String sortValue) {
		try {
			return OffsetDateTime.parse(sortValue);
		} catch (DateTimeParseException e) {
			// 위와 같은 사유 — 커서 내용은 우리가 만들었지만 클라이언트가 그대로 돌려준다는 보장이 없다.
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}
}
