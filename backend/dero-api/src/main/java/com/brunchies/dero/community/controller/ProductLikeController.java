package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.service.ProductLikeService;
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
 * 제품 찜 토글({@code api-spec.md} §5, REQ-COM-05). 전부 🔒.
 *
 * <p><b>{@code GET}에는 {@code SecurityConfig} 규칙이 한 줄 따로 붙어 있다.</b> 카탈로그 열람을
 * 여는 {@code GET /api/v1/products/**} permitAll(D14)이 이 경로까지 덮어서, 그대로 두면 익명 호출이
 * 401 대신 200 + {@code liked = false}로 답한다 — 찜 상태는 신원이 곧 답이라 그건 거짓말이다.
 * 그래서 그 permitAll <b>앞에</b> {@code /api/v1/products/*&#47;like}를 {@code authenticated()}로
 * 못 박았다(규칙은 선언 순서대로 평가된다).
 */
@RestController
@RequestMapping("/api/v1/products/{productId}/like")
@RequiredArgsConstructor
public class ProductLikeController {

	private final ProductLikeService productLikeService;

	@GetMapping
	public ResponseEntity<LikeStateResponse> get(
			Authentication authentication, @PathVariable Long productId) {
		return ResponseEntity.ok(
				productLikeService.get(AuthenticatedUserId.orNull(authentication), productId));
	}

	@PutMapping
	public ResponseEntity<Void> like(Authentication authentication, @PathVariable Long productId) {
		productLikeService.like(AuthenticatedUserId.orNull(authentication), productId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping
	public ResponseEntity<Void> unlike(Authentication authentication, @PathVariable Long productId) {
		productLikeService.unlike(AuthenticatedUserId.orNull(authentication), productId);
		return ResponseEntity.noContent().build();
	}
}
