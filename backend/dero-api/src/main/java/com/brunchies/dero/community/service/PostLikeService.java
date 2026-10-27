package com.brunchies.dero.community.service;

import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.Post;
import com.brunchies.dero.community.PostLike;
import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.repository.PostLikeRepository;
import com.brunchies.dero.community.repository.PostRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게시글 좋아요({@code api-spec.md} §6).
 *
 * <p>{@code post.like_count}가 집계 캐시라 배치와 같은 모양이다. 게시글에는 배치 같은 가시성
 * 상태가 없어 게이트는 "지워지지 않았는가" 하나다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostLikeService {

	private final PostLikeRepository postLikes;
	private final PostRepository posts;
	private final UserRepository users;

	public LikeStateResponse get(Long userId, Long postId) {
		Post post = existing(postId);
		return new LikeStateResponse(
				postLikes.existsByUser_IdAndPost_Id(userId, postId), post.getLikeCount());
	}

	@Transactional
	public void like(Long userId, Long postId) {
		Post post = existing(postId);
		if (postLikes.existsByUser_IdAndPost_Id(userId, postId)) {
			return;
		}
		try {
			postLikes.saveAndFlush(PostLike.create(users.getReferenceById(userId), post));
		} catch (DataIntegrityViolationException e) {
			// uq_post_like_user_id_post_id 위반 = 같은 사용자의 요청이 위 exists 검사 뒤에 먼저
			// 들어왔다는 뜻이다. 이미 눌린 상태와 결과가 같아야 하므로(멱등) 카운터를 올리지 않는다.
			return;
		}
		post.increaseLikeCount();
	}

	@Transactional
	public void unlike(Long userId, Long postId) {
		Post post = existing(postId);
		if (postLikes.deleteByUser_IdAndPost_Id(userId, postId) > 0) {
			post.decreaseLikeCount();
		}
	}

	private Post existing(Long postId) {
		return posts.findByIdAndDeletedAtIsNull(postId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.POST_NOT_FOUND));
	}
}
