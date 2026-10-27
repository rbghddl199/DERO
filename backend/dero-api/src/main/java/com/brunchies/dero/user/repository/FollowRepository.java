package com.brunchies.dero.user.repository;

import com.brunchies.dero.user.Follow;
import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 팔로우 애그리거트 루트 리포지토리(ADR-0007 결정 1의 2026-08-02 추가분 — DERO-344).
 *
 * <p><b>{@code User} 루트로 걸어가지 않는 이유</b>: 팔로워 목록은 커서 페이지네이션이고 팔로워 수는
 * 집계인데, {@code User}에 {@code @OneToMany} 컬렉션을 두면 둘 다 <b>컬렉션 통째 로드</b>가 된다
 * (ADR-0006 결정 11이 컬렉션 페치 + 페이지네이션을 금지한다). {@code placement_like}와 같은 모양의
 * 정션이고 이미 그쪽은 루트다.
 *
 * <p><b>hard delete다</b> — 언팔로우는 행 삭제이므로 소프트 삭제 필터(규칙 2)가 없다. 대신 대상
 * 사용자의 탈퇴는 {@code deleted_at}으로만 표시되므로 <b>조회 쿼리가 상대 쪽 탈퇴를 직접 거른다</b>:
 * 안 거르면 탈퇴한 사람이 팔로워 목록과 카운트에 계속 남는다.
 */
public interface FollowRepository extends JpaRepository<Follow, Long> {

	boolean existsByFollower_IdAndFollowing_Id(Long followerId, Long followingId);

	/** 언팔로우 — 삭제된 행 수를 돌려준다(0이어도 204다, 멱등). */
	long deleteByFollower_IdAndFollowing_Id(Long followerId, Long followingId);

	/** 이 사용자를 팔로우하는 사람 수(프로젝션 허용 예외 ① 집계). 탈퇴한 팔로워는 세지 않는다. */
	@Query("""
			select count(f) from Follow f
			where f.following.id = :userId and f.follower.deletedAt is null
			""")
	long countFollowers(@Param("userId") Long userId);

	/** 이 사용자가 팔로우하는 사람 수. 탈퇴한 대상은 세지 않는다. */
	@Query("""
			select count(f) from Follow f
			where f.follower.id = :userId and f.following.deletedAt is null
			""")
	long countFollowing(@Param("userId") Long userId);

	/**
	 * 팔로워 목록 — 등록순(id 오름차순) 커서 페이지. {@code follower}를 {@code join fetch}로 같이
	 * 끌어온다: 응답에 닉네임·프로필 key가 실리므로 안 걸면 페이지 크기만큼 SELECT가 더 나간다.
	 *
	 * <p>{@code cursorId}는 서비스가 첫 페이지에서 0으로 채워 넘긴다 — {@code (:cursorId is null or
	 * ...)} 형태의 null-guard를 JPQL 문자열에 넣으면 QueryDSL 하드 트리거(querydsl-rubric §2)에
	 * 걸린다({@code CommentRepository.findPageByPlacementId}와 같은 판단).
	 */
	@Query("""
			select f from Follow f
				join fetch f.follower u
			where f.following.id = :userId
				and u.deletedAt is null
				and f.id > :cursorId
			order by f.id asc
			""")
	List<Follow> findFollowerPage(@Param("userId") Long userId, @Param("cursorId") Long cursorId,
			Limit limit);

	/** 팔로잉 목록 — {@link #findFollowerPage}의 반대 방향. */
	@Query("""
			select f from Follow f
				join fetch f.following u
			where f.follower.id = :userId
				and u.deletedAt is null
				and f.id > :cursorId
			order by f.id asc
			""")
	List<Follow> findFollowingPage(@Param("userId") Long userId, @Param("cursorId") Long cursorId,
			Limit limit);
}
