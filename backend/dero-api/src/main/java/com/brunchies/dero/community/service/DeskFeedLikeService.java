package com.brunchies.dero.community.service;

import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.DeskFeed;
import com.brunchies.dero.community.DeskFeedLike;
import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.repository.DeskFeedLikeRepository;
import com.brunchies.dero.community.repository.DeskFeedRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 데스크피드 좋아요(api-spec.md §6-보 — post와 같은 3동사 계약). {@code desk_feed.like_count}가
 * 집계 캐시라 {@link PostLikeService}와 같은 모양이고, 게이트는 "지워지지 않았는가" 하나다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DeskFeedLikeService {

	private final DeskFeedLikeRepository deskFeedLikes;
	private final DeskFeedRepository deskFeeds;
	private final UserRepository users;

	public LikeStateResponse get(Long userId, Long deskFeedId) {
		DeskFeed deskFeed = existing(deskFeedId);
		return new LikeStateResponse(
				deskFeedLikes.existsByUser_IdAndDeskFeed_Id(userId, deskFeedId),
				deskFeed.getLikeCount());
	}

	@Transactional
	public void like(Long userId, Long deskFeedId) {
		DeskFeed deskFeed = existing(deskFeedId);
		if (deskFeedLikes.existsByUser_IdAndDeskFeed_Id(userId, deskFeedId)) {
			return;
		}
		try {
			deskFeedLikes.saveAndFlush(
					DeskFeedLike.create(users.getReferenceById(userId), deskFeed));
		} catch (DataIntegrityViolationException e) {
			// uq_desk_feed_like_user_id_desk_feed_id 위반 = 같은 사용자의 요청이 위 exists 검사 뒤에
			// 먼저 들어왔다는 뜻이다. 이미 눌린 상태와 결과가 같아야 하므로(멱등) 카운터를 안 올린다.
			return;
		}
		deskFeed.increaseLikeCount();
	}

	@Transactional
	public void unlike(Long userId, Long deskFeedId) {
		DeskFeed deskFeed = existing(deskFeedId);
		if (deskFeedLikes.deleteByUser_IdAndDeskFeed_Id(userId, deskFeedId) > 0) {
			deskFeed.decreaseLikeCount();
		}
	}

	private DeskFeed existing(Long deskFeedId) {
		return deskFeeds.findByIdAndDeletedAtIsNull(deskFeedId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.DESK_FEED_NOT_FOUND));
	}
}
