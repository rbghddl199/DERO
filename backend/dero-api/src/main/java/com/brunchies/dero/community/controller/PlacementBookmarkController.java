package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.BookmarkStateResponse;
import com.brunchies.dero.community.dto.PlacementBookmarkPutRequest;
import com.brunchies.dero.community.service.PlacementBookmarkService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 북마크 토글({@code api-spec.md} §4, REQ-COM-05·08). 전부 🔒.
 *
 * <p><b>{@code PUT} 본문은 선택이다</b>({@code @RequestBody(required = false)}) — 그룹을 안 고르고
 * 하트만 누르는 흐름이 정상이라 {@code Content-Type} 없는 빈 {@code PUT}도 받아야 한다. 본문이
 * 없으면 그룹 미지정으로 담긴다.
 */
@RestController
@RequestMapping("/api/v1/placements/{placementId}/bookmark")
@RequiredArgsConstructor
public class PlacementBookmarkController {

	private final PlacementBookmarkService placementBookmarkService;

	@GetMapping
	public ResponseEntity<BookmarkStateResponse> get(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(
				placementBookmarkService.get(AuthenticatedUserId.orNull(authentication), placementId));
	}

	@PutMapping
	public ResponseEntity<Void> bookmark(
			Authentication authentication,
			@PathVariable Long placementId,
			@RequestBody(required = false) PlacementBookmarkPutRequest request) {
		placementBookmarkService.bookmark(
				AuthenticatedUserId.orNull(authentication), placementId, request);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping
	public ResponseEntity<Void> unbookmark(
			Authentication authentication, @PathVariable Long placementId) {
		placementBookmarkService.unbookmark(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity.noContent().build();
	}
}
