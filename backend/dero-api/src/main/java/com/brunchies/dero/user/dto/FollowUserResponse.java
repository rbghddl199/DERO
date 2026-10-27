package com.brunchies.dero.user.dto;

import com.brunchies.dero.user.User;

/**
 * 팔로워·팔로잉 목록의 한 줄({@code docs/context/api-spec.md} §3).
 *
 * <p>{@code profileImageUrl}은 {@code user.profile_image_key}가 아니라 <b>발급 시점에 조립한
 * presigned GET URL</b>이다 — key를 그대로 노출하지 않는다(user/CLAUDE.md). 조립은 서비스가 하므로
 * 여기 {@code from()}은 URL을 인자로 받는다.
 */
public record FollowUserResponse(Long id, String nickname, String profileImageUrl) {

	public static FollowUserResponse from(User user, String profileImageUrl) {
		return new FollowUserResponse(user.getId(), user.getNickname(), profileImageUrl);
	}
}
