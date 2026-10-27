package com.brunchies.dero.user.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.user.Follow;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.dto.FollowUserResponse;
import com.brunchies.dero.user.repository.FollowRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 팔로우·언팔로우와 팔로워·팔로잉 목록(REQ-COM-07, {@code api-spec.md} §3).
 *
 * <p><b>{@code PUT}·{@code DELETE}는 멱등이다</b> — 두 번 눌러도 행은 1개, 팔로워 수도 1이고, 안
 * 눌린 상태의 {@code DELETE}도 204다({@code PlacementLikeService}와 같은 규약).
 *
 * <p><b>목록은 🔓다</b> — 비로그인도 남의 팔로워·팔로잉을 본다. 팔로우 관계는 공개 정보이고
 * 프로필 화면이 로그인 전에도 떠야 한다(D14).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class FollowService {

	/** 첫 페이지의 커서 자리값. id가 시퀀스라 항상 양수여서 0은 "커서 없음"과 같은 뜻이다. */
	private static final long NO_CURSOR = 0L;

	private final FollowRepository follows;
	private final UserRepository users;
	private final PublicImageUrlResolver publicImageUrl;

	/**
	 * 팔로우 → 204. 이미 팔로우 중이면 아무것도 하지 않는다.
	 *
	 * <p>자기 자신 검사가 <b>대상 존재 확인보다 먼저</b>다 — 뒤에 두면 탈퇴한 본인 id로 부를 때
	 * 404가 나가서 "왜 안 되는지"가 뒤바뀐다.
	 */
	@Transactional
	public void follow(Long followerId, Long followingId) {
		if (followerId.equals(followingId)) {
			throw new BusinessException(UserErrorCode.USER_SELF_FOLLOW_NOT_ALLOWED);
		}
		User target = requireActiveUser(followingId);
		if (follows.existsByFollower_IdAndFollowing_Id(followerId, followingId)) {
			return;
		}
		try {
			follows.saveAndFlush(Follow.create(users.getReferenceById(followerId), target));
		} catch (DataIntegrityViolationException e) {
			// uq_follow_follower_id_following_id 위반 = 위 exists 검사와 이 INSERT 사이에 같은
			// 사용자의 요청이 먼저 들어왔다는 뜻이다. 이미 팔로우한 상태와 결과가 같아야 하므로(멱등)
			// 아무 일도 없었던 것처럼 끝낸다.
			return;
		}
	}

	/** 언팔로우 → 204. 안 눌린 상태여도 204다(멱등). */
	@Transactional
	public void unfollow(Long followerId, Long followingId) {
		requireActiveUser(followingId);
		follows.deleteByFollower_IdAndFollowing_Id(followerId, followingId);
	}

	/** 팔로워 목록 — 등록순 커서 페이지. */
	public CursorPage<FollowUserResponse> listFollowers(Long userId, String cursor, int size) {
		requireActiveUser(userId);
		return page(cursor, size, cursorId -> follows.findFollowerPage(userId, cursorId,
				Limit.of(size + 1)), Follow::getFollower, follows.countFollowers(userId));
	}

	/** 팔로잉 목록 — 등록순 커서 페이지. */
	public CursorPage<FollowUserResponse> listFollowing(Long userId, String cursor, int size) {
		requireActiveUser(userId);
		return page(cursor, size, cursorId -> follows.findFollowingPage(userId, cursorId,
				Limit.of(size + 1)), Follow::getFollowing, follows.countFollowing(userId));
	}

	/**
	 * 두 목록은 <b>방향만 다르고 조립이 같다</b> — 커서 해독·{@code size + 1} 다음 쪽 판정·응답 변환이
	 * 한 벌이라 여기 모은다. 카운트는 커서와 무관하게 호출자가 넘긴다.
	 */
	private CursorPage<FollowUserResponse> page(String cursor, int size,
			Function<Long, List<Follow>> query, Function<Follow, User> pick, long totalCount) {
		Long cursorId = CursorCodec.decode(cursor);
		List<Follow> rows = query.apply(cursorId == null ? NO_CURSOR : cursorId);

		boolean hasNext = rows.size() > size;
		List<Follow> content = hasNext ? rows.subList(0, size) : rows;
		String nextCursor =
				hasNext ? CursorCodec.encode(content.get(content.size() - 1).getId()) : null;

		List<FollowUserResponse> body = content.stream()
				.map(pick)
				.map(user -> FollowUserResponse.from(user, presignedProfileImage(user)))
				.toList();
		return new CursorPage<>(body, nextCursor, hasNext, totalCount);
	}

	/** key를 그대로 노출하지 않는다 — 완성 URL은 WAS가 발급 시점에 조립한다(user/CLAUDE.md). */
	private String presignedProfileImage(User user) {
		return user.getProfileImageKey() == null
				? null
				: publicImageUrl.url(user.getProfileImageKey());
	}

	private User requireActiveUser(Long userId) {
		return users.findByIdAndDeletedAtIsNull(userId)
				.orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
	}
}
