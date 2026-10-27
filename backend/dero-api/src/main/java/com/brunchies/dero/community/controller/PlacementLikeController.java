package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.service.PlacementLikeService;
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
 * 배치 좋아요 토글({@code api-spec.md} §4, REQ-COM-05). 전부 🔒.
 *
 * <p><b>{@code PUT}·{@code DELETE}는 멱등이라 둘 다 204다</b> — 이미 눌린 상태의 {@code PUT}도, 안
 * 눌린 상태의 {@code DELETE}도 에러가 아니다. 볼 수 없는 배치는 404다(403이 아니다).
 *
 * <p>{@code GET}은 표에 없던 것을 얹은 것이다 — 근거는 {@code LikeStateResponse} Javadoc.
 */
@RestController
@RequestMapping("/api/v1/placements/{placementId}/like")
@RequiredArgsConstructor
public class PlacementLikeController {

	private final PlacementLikeService placementLikeService;

	@GetMapping
	public ResponseEntity<LikeStateResponse> get(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(
				placementLikeService.get(AuthenticatedUserId.orNull(authentication), placementId));
	}

	@PutMapping
	public ResponseEntity<Void> like(
			Authentication authentication, @PathVariable Long placementId) {
		placementLikeService.like(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping
	public ResponseEntity<Void> unlike(
			Authentication authentication, @PathVariable Long placementId) {
		placementLikeService.unlike(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity.noContent().build();
	}
}
