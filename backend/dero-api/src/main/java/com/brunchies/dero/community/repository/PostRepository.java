package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.Post;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 게시글 애그리거트 루트 리포지토리(ADR-0011 결정 8) — {@code post_image}가 이 안에 산다.
 * {@code PostImageRepository}를 만들지 않는다.
 *
 * <p>소프트 삭제 필터는 쿼리 자체에 박는다(규칙 2) — 서비스에서 거르면 한 자리만 빠뜨려도 지워진
 * 글이 그 경로에서만 살아난다.
 */
public interface PostRepository extends JpaRepository<Post, Long>, PostRepositoryCustom {

	/** 좋아요 대상 존재 확인 경로. 지워진 글에는 좋아요를 누를 수 없다. */
	Optional<Post> findByIdAndDeletedAtIsNull(Long id);

	/**
	 * 상세·수정 경로 — 사진까지 한 번에 끌어온다. bag이 {@code images} 하나뿐이라
	 * {@code MultipleBagFetchException}이 나지 않고, 단건이라 {@code HHH90003004}도 대상이 아니다.
	 * 해시태그는 두 번째 bag이라 같이 못 물고 {@code default_batch_fetch_size}가 받는다.
	 */
	@Query("""
			select p from Post p
				left join fetch p.user
				left join fetch p.images
			where p.id = :id
				and p.deletedAt is null
			""")
	Optional<Post> findDetailById(@Param("id") Long id);

	/**
	 * 전량 재색인({@code PostSearchService.reindexAll}) — 지워지지 않은 글 전부다(ADR-0019 결정 4:
	 * 색인은 전량이고 노출 판정은 Postgres가 한다).
	 *
	 * <p>해시태그는 <b>일부러 {@code join fetch}하지 않는다</b> — 컬렉션이라 문서마다 행이 곱해지고,
	 * {@code default_batch_fetch_size = 100}이 어차피 {@code IN} 한 방으로 묶어 읽는다. 작성자는
	 * to-one이라 같이 끌어온다.
	 */
	@Query("""
			select p from Post p
				left join fetch p.user
			where p.deletedAt is null
			order by p.id
			""")
	List<Post> findAllForIndexing();
}
