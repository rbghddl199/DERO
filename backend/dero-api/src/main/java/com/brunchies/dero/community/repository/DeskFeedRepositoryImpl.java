package com.brunchies.dero.community.repository;

import static com.brunchies.dero.catalog.QHashtag.hashtag;
import static com.brunchies.dero.community.QDeskFeed.deskFeed;
import static com.brunchies.dero.community.QDeskFeedHashtag.deskFeedHashtag;
import static com.brunchies.dero.community.QDeskFeedImage.deskFeedImage;

import com.brunchies.dero.community.DeskFeed;
import com.brunchies.dero.community.DeskFeedSort;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorCodec;
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
 * {@link DeskFeedRepositoryCustom} 구현 — QueryDSL(ADR-0018 결정 2).
 *
 * <p><b>해시태그 필터는 조인이 아니라 {@code exists} 서브쿼리다</b> — 정션을 join하면 태그가 여러
 * 개인 글이 결과에 중복으로 실려 커서 페이지 크기가 어긋난다({@code PostRepositoryImpl}·
 * {@code PlacementRepositoryImpl}과 글자 그대로 같은 형태).
 *
 * <p>가시성 게이트는 {@code deleted_at is null} + <b>사진 1장 이상</b>이다 — 데스크피드에는 배치
 * 같은 게시 상태가 없고(쓰는 행위가 곧 게시), 대신 사진이 정본 콘텐츠라 <b>0장 글(작성 → 업로드
 * 사이의 중간 상태)은 목록에 노출하지 않는다</b>. "사진 1~30장 필수"의 최소 1장은 생성 시점에
 * 강제할 수 없어(2단계 업로드) 이 노출 게이트가 강제 지점이다. {@code ?placementId} 역방향 조회도
 * 같은 쿼리라 같이 걸린다. 목록과 총 개수가 같은 술어 헬퍼를 공유한다.
 */
@RequiredArgsConstructor
public class DeskFeedRepositoryImpl implements DeskFeedRepositoryCustom {

	private final JPAQueryFactory queryFactory;

	@Override
	public List<DeskFeed> findPage(String hashtagName, Long ownerId, Long placementId,
			DeskFeedSort sort, CursorCodec.Composite cursor, Limit limit) {
		return queryFactory.selectFrom(deskFeed)
				// 작성자 닉네임을 목록에 실어야 한다. to-one이라 limit과 같이 써도 행이 안 는다.
				.leftJoin(deskFeed.user).fetchJoin()
				.where(deskFeed.deletedAt.isNull(), hasImage(), hashtagNamed(hashtagName),
						ownerEq(ownerId), placementEq(placementId), cursorAfter(sort, cursor))
				.orderBy(orderOf(sort))
				.limit(limit.max())
				.fetch();
	}

	@Override
	public long countPage(String hashtagName, Long ownerId, Long placementId) {
		Long count = queryFactory.select(deskFeed.count())
				.from(deskFeed)
				.where(deskFeed.deletedAt.isNull(), hasImage(), hashtagNamed(hashtagName),
						ownerEq(ownerId), placementEq(placementId))
				.fetchOne();
		return count == null ? 0 : count;
	}

	/**
	 * 사진 0장 글 제외 — 작성 → 업로드 2단계 사이의 중간 상태가 빈 카드로 노출되는 것을 막는다.
	 * {@code exists} 서브쿼리인 이유는 {@link #hashtagNamed}와 같다(조인은 행 수를 곱한다).
	 */
	private BooleanExpression hasImage() {
		return JPAExpressions.selectOne()
				.from(deskFeedImage)
				.where(deskFeedImage.deskFeed.eq(deskFeed))
				.exists();
	}

	private BooleanExpression hashtagNamed(String hashtagName) {
		if (hashtagName == null || hashtagName.isBlank()) {
			return null;
		}
		return JPAExpressions.selectOne()
				.from(deskFeedHashtag)
				.join(deskFeedHashtag.hashtag, hashtag)
				.where(deskFeedHashtag.deskFeed.eq(deskFeed), hashtag.deletedAt.isNull(),
						hashtag.name.eq(hashtagName))
				.exists();
	}

	/**
	 * {@code deskFeed.user}는 탈퇴({@code ON DELETE SET NULL})로 NULL일 수 있다 — {@code eq}는
	 * NULL과 비교하면 참이 되지 않으므로 주인 없는 글이 남의 {@code ?owner} 결과에 섞이지 않는다.
	 */
	private BooleanExpression ownerEq(Long ownerId) {
		return ownerId == null ? null : deskFeed.user.id.eq(ownerId);
	}

	/** {@code ?placementId} — 역방향 조회("이 배치의 실사 사진"). {@code idx_desk_feed_placement_id}를 탄다. */
	private BooleanExpression placementEq(Long placementId) {
		return placementId == null ? null : deskFeed.placement.id.eq(placementId);
	}

	/**
	 * 키셋 조건 — {@code 정렬키 < 커서} 또는 {@code 정렬키 = 커서 AND id < 커서id}. 동점 구간을 id로
	 * 갈라야 커서가 항목을 건너뛰거나 두 번 보여주지 않는다({@code PlacementRepositoryImpl}과 동형).
	 */
	private BooleanExpression cursorAfter(DeskFeedSort sort, CursorCodec.Composite cursor) {
		if (cursor == null) {
			return null;
		}
		if (sort == DeskFeedSort.POPULAR) {
			int likeCount = parseInt(cursor.sortValue());
			return deskFeed.likeCount.lt(likeCount)
					.or(deskFeed.likeCount.eq(likeCount).and(deskFeed.id.lt(cursor.id())));
		}
		OffsetDateTime createdAt = parseCreatedAt(cursor.sortValue());
		return deskFeed.createdAt.lt(createdAt)
				.or(deskFeed.createdAt.eq(createdAt).and(deskFeed.id.lt(cursor.id())));
	}

	/** 정렬 축의 Q경로 매핑. 값 자체의 매핑은 {@link DeskFeedSort#cursorValueOf}에 있다. */
	private OrderSpecifier<?>[] orderOf(DeskFeedSort sort) {
		return sort == DeskFeedSort.POPULAR
				? new OrderSpecifier<?>[] {deskFeed.likeCount.desc(), deskFeed.id.desc()}
				: new OrderSpecifier<?>[] {deskFeed.createdAt.desc(), deskFeed.id.desc()};
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
			// 위와 같은 사유 — 커서는 우리가 만들었지만 클라이언트가 그대로 돌려준다는 보장이 없다.
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}
}
