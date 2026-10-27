package com.brunchies.dero.community.repository;

import static com.brunchies.dero.catalog.QHashtag.hashtag;
import static com.brunchies.dero.community.QPost.post;
import static com.brunchies.dero.community.QPostHashtag.postHashtag;

import com.brunchies.dero.community.Post;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;

/**
 * {@link PostRepositoryCustom} 구현 — QueryDSL(ADR-0018 결정 2).
 *
 * <p><b>해시태그 필터는 조인이 아니라 {@code exists} 서브쿼리다.</b> 정션을 join하면 태그가 여러 개인
 * 글이 결과에 중복으로 실려 커서 페이지 크기가 조용히 어긋난다 — {@code distinct}로 덮으면
 * {@code left join fetch}와 같이 쓸 때 다시 문제가 된다. 존재 여부만 물으면 행 수가 안 변한다.
 *
 * <p>{@code post.user}는 to-one이라 {@code fetchJoin}과 {@code limit}을 같이 써도 안전하다
 * ({@code query-conventions} §2·§3). 컬렉션({@code images}·{@code hashtags})은 여기서 안 물고,
 * 서비스가 트랜잭션 안에서 접근할 때 {@code default_batch_fetch_size = 100}이 IN으로 묶어 읽는다.
 *
 * <p>목록과 총 개수가 <b>같은 술어 헬퍼를 공유한다</b> — 따로 들면 한쪽만 빠뜨렸을 때 "20건이라는데
 * 3건만 보인다"가 된다.
 */
@RequiredArgsConstructor
public class PostRepositoryImpl implements PostRepositoryCustom {

	private final JPAQueryFactory queryFactory;

	@Override
	public List<Post> findPage(String hashtagName, Long ownerId, Long cursorId, Limit limit) {
		return queryFactory.selectFrom(post)
				.leftJoin(post.user).fetchJoin()
				.where(post.deletedAt.isNull(), hashtagNamed(hashtagName), ownerEq(ownerId),
						cursorBefore(cursorId))
				.orderBy(post.id.desc())
				.limit(limit.max())
				.fetch();
	}

	@Override
	public long countPage(String hashtagName, Long ownerId) {
		Long count = queryFactory.select(post.count())
				.from(post)
				.where(post.deletedAt.isNull(), hashtagNamed(hashtagName), ownerEq(ownerId))
				.fetchOne();
		return count == null ? 0 : count;
	}

	@Override
	public List<Post> findAllByIds(List<Long> ids, String hashtagName, Long ownerId) {
		if (ids.isEmpty()) {
			return List.of();
		}
		return queryFactory.selectFrom(post)
				.leftJoin(post.user).fetchJoin()
				.where(post.id.in(ids), post.deletedAt.isNull(), hashtagNamed(hashtagName),
						ownerEq(ownerId))
				.fetch();
	}

	private BooleanExpression hashtagNamed(String hashtagName) {
		if (hashtagName == null || hashtagName.isBlank()) {
			return null;
		}
		return JPAExpressions.selectOne()
				.from(postHashtag)
				.join(postHashtag.hashtag, hashtag)
				.where(postHashtag.post.eq(post), hashtag.deletedAt.isNull(),
						hashtag.name.eq(hashtagName))
				.exists();
	}

	/**
	 * {@code post.user}는 탈퇴({@code ON DELETE SET NULL})로 NULL일 수 있다. {@code eq}는 NULL과
	 * 비교하면 참이 되지 않으므로 주인 없는 글이 남의 {@code ?owner} 결과에 섞이지 않는다 —
	 * 배치 목록이 3값 논리를 명시적으로 끊은 것과 같은 자리다.
	 */
	private BooleanExpression ownerEq(Long ownerId) {
		return ownerId == null ? null : post.user.id.eq(ownerId);
	}

	/** 최신순이라 커서보다 <b>작은</b> id가 다음 페이지다. */
	private BooleanExpression cursorBefore(Long cursorId) {
		return cursorId == null ? null : post.id.lt(cursorId);
	}
}
