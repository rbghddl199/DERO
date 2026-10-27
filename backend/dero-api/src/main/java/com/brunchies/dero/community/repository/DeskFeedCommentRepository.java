package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.DeskFeedComment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

/**
 * 데스크피드 댓글 루트 리포지토리 — {@code CommentRepository}(배치 댓글)와 같은 자리다.
 * {@link PostCommentRepository}와 달리 <b>목록 API가 처음부터 있다</b>(REQ-COM-16 — 마커 시절
 * "가짜 댓글"의 처방이 이 실영속이다).
 */
public interface DeskFeedCommentRepository extends JpaRepository<DeskFeedComment, Long> {

	/**
	 * 최신순(id 내림차순) 커서 페이지. 작성자는 to-one이라 {@code join fetch}와 {@code Limit}을 같이
	 * 써도 안전하다(query-conventions §2·§3).
	 */
	@Query("""
			select c from DeskFeedComment c
				left join fetch c.user
			where c.deskFeed.id = :deskFeedId
				and c.deletedAt is null
				and c.id < :cursorId
			order by c.id desc
			""")
	List<DeskFeedComment> findPageByDeskFeedId(@Param("deskFeedId") Long deskFeedId,
			@Param("cursorId") Long cursorId, Limit limit);

	long countByDeskFeed_IdAndDeletedAtIsNull(Long deskFeedId);

	/** 삭제 경로 — 글 경로와 댓글 id가 실제로 짝인지까지 쿼리가 확인한다. */
	@Query("""
			select c from DeskFeedComment c
				left join fetch c.user
			where c.id = :commentId
				and c.deskFeed.id = :deskFeedId
				and c.deletedAt is null
			""")
	Optional<DeskFeedComment> findOwnedByDeskFeed(@Param("commentId") Long commentId,
			@Param("deskFeedId") Long deskFeedId);

	/**
	 * 글 여러 건의 댓글 수를 <b>한 번에</b> 센다 — 목록 카드마다 count를 치면 N+1이다. 집계라
	 * 프로젝션이 허용되는 예외 ①이다(ADR-0018 결정 1). 댓글 0건인 글은 결과에 행이 없다 —
	 * 호출부가 0으로 채운다.
	 */
	@Query("""
			select c.deskFeed.id, count(c) from DeskFeedComment c
			where c.deskFeed.id in :deskFeedIds
				and c.deletedAt is null
			group by c.deskFeed.id
			""")
	List<Object[]> countByDeskFeedIds(@Param("deskFeedIds") Collection<Long> deskFeedIds);
}
