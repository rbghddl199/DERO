package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.PostLike;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 게시글 좋아요 애그리거트 루트 리포지토리(ADR-0011 결정 8) — 남이 누르는 것이라 {@code Post} 밖의
 * 각자 루트다.
 *
 * <p>{@link PlacementLikeRepository}와 모양이 같지만 <b>합치지 않는다</b>(ADR-0011 결정 3) —
 * 대상별로 표가 따로라 다형 좋아요를 둘 자리가 애초에 없다.
 */
public interface PostLikeRepository extends JpaRepository<PostLike, Long> {

	boolean existsByUser_IdAndPost_Id(Long userId, Long postId);

	long deleteByUser_IdAndPost_Id(Long userId, Long postId);
}
