package com.brunchies.dero.user.controller;

import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.user.dto.FollowUserResponse;
import com.brunchies.dero.user.service.FollowService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 팔로우 토글과 팔로워·팔로잉 목록({@code api-spec.md} §3, REQ-COM-07).
 *
 * <p>토글은 🔒, 목록은 🔓다. <b>{@code PUT}·{@code DELETE}는 멱등이라 둘 다 204다</b> — 이미 팔로우
 * 중인 {@code PUT}도, 안 한 상태의 {@code DELETE}도 에러가 아니다. 자기 자신 팔로우는 422다.
 *
 * <p>{@link UserController}와 경로 접두를 공유하지만 클래스를 나눈다 — 한 파일에 8개 핸들러가 모이면
 * "내 정보"와 "남과의 관계"라는 두 관심사가 섞인다.
 */
@RestController
@RequestMapping("/api/v1/users/{userId}")
@RequiredArgsConstructor
public class FollowController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final FollowService followService;

	@PutMapping("/follow")
	public ResponseEntity<Void> follow(Authentication authentication, @PathVariable Long userId) {
		followService.follow(viewerId(authentication), userId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/follow")
	public ResponseEntity<Void> unfollow(Authentication authentication, @PathVariable Long userId) {
		followService.unfollow(viewerId(authentication), userId);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 팔로워 목록 — 등록순 커서 페이지. {@code size}는 어노테이션 검증 대신 여기서 [1, 100] 사이로
	 * 자른다 — 목록 크기는 거절할 입력이 아니라 서버가 정하는 상한이다.
	 */
	@GetMapping("/followers")
	public ResponseEntity<CursorPage<FollowUserResponse>> followers(
			@PathVariable Long userId,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(followService.listFollowers(userId, cursor, effectiveSize(size)));
	}

	@GetMapping("/following")
	public ResponseEntity<CursorPage<FollowUserResponse>> following(
			@PathVariable Long userId,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(followService.listFollowing(userId, cursor, effectiveSize(size)));
	}

	private static int effectiveSize(Integer size) {
		return size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
	}

	/**
	 * 토글은 🔒 경로라 여기 오는 인증은 항상 {@code JwtAuthenticationToken}이다 —
	 * {@code AuthenticatedUserId.orNull}을 통과시키지 않는 것은 그 근거이고, 만약 익명이 닿으면
	 * NPE가 아니라 시큐리티가 먼저 401을 낸다.
	 */
	private static Long viewerId(Authentication authentication) {
		return Long.valueOf(authentication.getName());
	}
}
