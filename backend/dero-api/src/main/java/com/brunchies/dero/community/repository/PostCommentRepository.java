package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.PostComment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 게시글 댓글 애그리거트 루트 리포지토리(ADR-0011 결정 8) — {@code CommentRepository}가
 * {@code Placement} 밖 루트인 것과 같다.
 *
 * <p>댓글 <b>목록</b> API는 아직 없다(DERO-345 범위 밖) — 여기 있는 것은 게시글 목록·상세에
 * 실을 개수뿐이다.
 */
public interface PostCommentRepository extends JpaRepository<PostComment, Long> {

	/**
	 * 글 여러 건의 댓글 수를 <b>한 번에</b> 센다 — 목록 카드마다 count를 치면 N+1이다. 집계라
	 * 프로젝션이 허용되는 예외 ①에 해당한다(ADR-0018 결정 1).
	 *
	 * <p>댓글이 0건인 글은 결과에 <b>행이 없다</b>({@code group by}라 그렇다) — 호출부가 0으로
	 * 채워야 한다.
	 */
	@Query("""
			select c.post.id, count(c) from PostComment c
			where c.post.id in :postIds
				and c.deletedAt is null
			group by c.post.id
			""")
	List<Object[]> countByPostIds(@Param("postIds") Collection<Long> postIds);
}
