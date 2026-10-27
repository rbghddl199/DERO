package com.brunchies.dero.image.controller;

import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.image.dto.GeneratedImageResponse;
import com.brunchies.dero.image.service.GeneratedImageService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 상세의 AI 상상도(api-spec.md §4, REQ-IMG-01).
 *
 * <p>🔓는 "선택적 인증"이라 신원이 응답 범위를 바꾼다 — 비로그인은 {@code PUBLIC} 배치의 것만 보고,
 * 규칙에 안 맞으면 404다. 그 판정은 배치 가시성 쿼리 한 곳이 진다.
 *
 * <p>생성 엔드포인트({@code POST .../generated-images})를 만들지 않는다(ADR-0015 결정 12) —
 * 생성 입구가 둘이면 같은 큐에 두 경로가 들어오고 판정 게이트·상태 전이가 한쪽에만 걸린다.
 */
@RestController
@RequestMapping("/api/v1/placements")
@RequiredArgsConstructor
public class PlacementGeneratedImageController {

	private final GeneratedImageService generatedImageService;

	@GetMapping("/{placementId}/generated-images")
	public ResponseEntity<List<GeneratedImageResponse>> listGeneratedImages(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(generatedImageService.listForPlacement(
				placementId, AuthenticatedUserId.orNull(authentication)));
	}
}
