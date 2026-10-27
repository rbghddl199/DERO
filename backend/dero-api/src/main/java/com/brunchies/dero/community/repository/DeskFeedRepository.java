package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.DeskFeed;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 데스크피드 애그리거트 루트 리포지토리 — {@code desk_feed_image}·{@code desk_feed_hashtag}가 이
 * 안에 산다. {@code DeskFeedImageRepository}를 만들지 않는다({@code PostRepository}와 같은 경계).
 *
 * <p>소프트 삭제 필터는 쿼리 자체에 박는다(규칙 2).
 */
public interface DeskFeedRepository extends JpaRepository<DeskFeed, Long>, DeskFeedRepositoryCustom {

	/** 좋아요·댓글의 대상 존재 확인 경로. 지워진 글은 대상이 아니다. */
	Optional<DeskFeed> findByIdAndDeletedAtIsNull(Long id);

	/**
	 * 상세·수정 경로 — 작성자·첨부 배치·사진까지 한 번에 끌어온다. bag이 {@code images} 하나뿐이라
	 * {@code MultipleBagFetchException}이 나지 않고, 단건이라 {@code HHH90003004}도 대상이 아니다.
	 * 해시태그는 두 번째 bag이라 같이 못 물고 {@code default_batch_fetch_size}가 받는다.
	 *
	 * <p>{@code placement}는 nullable to-one이라 {@code left join fetch}로 스펠아웃한다
	 * (query-conventions §2 — 안 걸면 존재 확인 SELECT가 따로 나간다).
	 */
	@Query("""
			select df from DeskFeed df
				left join fetch df.user
				left join fetch df.placement
				left join fetch df.images
			where df.id = :id
				and df.deletedAt is null
			""")
	Optional<DeskFeed> findDetailById(@Param("id") Long id);
}
