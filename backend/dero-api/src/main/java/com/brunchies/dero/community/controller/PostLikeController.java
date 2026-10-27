package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.service.PostLikeService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게시글 좋아요 토글({@code api-spec.md} §6). 전부 🔒 — {@code SecurityConfig}에 게시글 경로를 여는
 * 규칙이 없어 기본값 {@code authenticated()}가 적용된다.
 */
@RestController
@RequestMapping("/api/v1/posts/{postId}/like")
@RequiredArgsConstructor
public class PostLikeController {

	private final PostLikeService postLikeService;

	@GetMapping
	public ResponseEntity<LikeStateResponse> get(
			Authentication authentication, @PathVariable Long postId) {
		return ResponseEntity.ok(
				postLikeService.get(AuthenticatedUserId.orNull(authentication), postId));
	}

	@PutMapping
	public ResponseEntity<Void> like(Authentication authentication, @PathVariable Long postId) {
		postLikeService.like(AuthenticatedUserId.orNull(authentication), postId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping
	public ResponseEntity<Void> unlike(Authentication authentication, @PathVariable Long postId) {
		postLikeService.unlike(AuthenticatedUserId.orNull(authentication), postId);
		return ResponseEntity.noContent().build();
	}
}
