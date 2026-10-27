package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.DeskFeedLike;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 데스크피드 좋아요 루트 리포지토리 — {@link PostLikeRepository}와 모양이 같지만 <b>합치지 않는다</b>
 * (ADR-0011 결정 3: 대상별로 표가 따로라 다형 좋아요를 둘 자리가 없다).
 */
public interface DeskFeedLikeRepository extends JpaRepository<DeskFeedLike, Long> {

	boolean existsByUser_IdAndDeskFeed_Id(Long userId, Long deskFeedId);

	long deleteByUser_IdAndDeskFeed_Id(Long userId, Long deskFeedId);
}
