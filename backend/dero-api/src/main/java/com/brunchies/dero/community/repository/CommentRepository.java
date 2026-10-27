package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.Comment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 댓글 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p><b>소프트 삭제 필터는 전 메서드의 쿼리 안에 있다</b>(규칙 2) — 서비스에서 거르면 한 자리만
 * 빠뜨려도 지워진 댓글이 그 경로에서만 살아난다.
 */
public interface CommentRepository extends JpaRepository<Comment, Long> {

	/**
	 * 최신순(id 내림차순) 커서 페이지. <b>{@code user}를 {@code left join fetch}로 같이 끌어온다</b> — 응답에
	 * 닉네임·프로필 key가 실리므로 안 걸면 페이지 크기만큼 SELECT가 더 나간다. 탈퇴로 {@code user}가
	 * NULL일 수 있어 {@code left}다.
	 *
	 * <p><b>{@code cursorId}는 서비스가 첫 페이지에서 {@code Long.MAX_VALUE}로 채워 넘긴다</b> —
	 * {@code (:cursorId is null or ...)} 형태의 null-guard를 문자열 JPQL에 넣으면 QueryDSL 하드
	 * 트리거(querydsl-rubric §2)에 걸린다. 어떤 id도 {@code Long.MAX_VALUE}보다 작으므로 이 값은
	 * "커서 없음"과 같은 뜻이고, 조건이 정적으로 남아 이 계단({@code @Query})에 머무를 수 있다.
	 *
	 * <p>컬렉션 페치가 없어 {@link Limit}과 같이 써도 {@code HHH90003004}가 안 뜬다.
	 */
	@Query("""
			select c from Comment c
				left join fetch c.user
			where c.placement.id = :placementId
				and c.deletedAt is null
				and c.id < :cursorId
			order by c.id desc
			""")
	List<Comment> findPageByPlacementId(@Param("placementId") Long placementId,
			@Param("cursorId") Long cursorId, Limit limit);

	/** {@code CursorPage.totalCount()}용 — 커서를 뺀 같은 조건(프로젝션 허용 예외 ① 집계). */
	long countByPlacement_IdAndDeletedAtIsNull(Long placementId);

	/**
	 * 삭제 경로 — <b>배치 소속까지 조건에 넣는다.</b> id만으로 찾으면 다른 배치의 댓글 id를 URL에
	 * 끼워 넣어 지울 수 있다. 소유자 검사는 이 뒤에 서비스가 한다(그건 403이고 이건 404다).
	 */
	@Query("""
			select c from Comment c
				left join fetch c.user
			where c.id = :commentId
				and c.placement.id = :placementId
				and c.deletedAt is null
			""")
	Optional<Comment> findOwnedByPlacement(@Param("commentId") Long commentId,
			@Param("placementId") Long placementId);
}
