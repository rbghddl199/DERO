package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.service.DeskFeedLikeService;
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
 * 데스크피드 좋아요 토글(api-spec.md §6-보 — post와 같은 3동사 계약). 전부 🔒 — {@code GET}은
 * 신원이 곧 답이라 {@code SecurityConfig}가 데스크피드 permitAll보다 <b>앞에</b> authenticated
 * 규칙을 둔다(게시글 좋아요 GET과 같은 순서 함정).
 */
@RestController
@RequestMapping("/api/v1/desk-feeds/{deskFeedId}/like")
@RequiredArgsConstructor
public class DeskFeedLikeController {

	private final DeskFeedLikeService deskFeedLikeService;

	@GetMapping
	public ResponseEntity<LikeStateResponse> get(
			Authentication authentication, @PathVariable Long deskFeedId) {
		return ResponseEntity.ok(
				deskFeedLikeService.get(AuthenticatedUserId.orNull(authentication), deskFeedId));
	}

	@PutMapping
	public ResponseEntity<Void> like(
			Authentication authentication, @PathVariable Long deskFeedId) {
		deskFeedLikeService.like(AuthenticatedUserId.orNull(authentication), deskFeedId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping
	public ResponseEntity<Void> unlike(
			Authentication authentication, @PathVariable Long deskFeedId) {
		deskFeedLikeService.unlike(AuthenticatedUserId.orNull(authentication), deskFeedId);
		return ResponseEntity.noContent().build();
	}
}
