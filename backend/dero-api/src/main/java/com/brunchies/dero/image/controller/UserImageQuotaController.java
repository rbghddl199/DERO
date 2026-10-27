package com.brunchies.dero.image.controller;

import com.brunchies.dero.image.dto.ImageQuotaResponse;
import com.brunchies.dero.image.service.ImageQuotaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/users/me/image-quota}(REQ-IMG-03, api-spec.md §3). 🔒.
 *
 * <p><b>경로는 {@code /users/...}인데 패키지는 {@code image}다</b> — 카운트 근거인
 * {@code generated_image}를 {@code user}에서 볼 수 없기 때문이다(사유 전문은
 * {@link com.brunchies.dero.image.service.ImageQuotaService}). {@code PlacementFeedEntryController}가
 * 같은 이유로 여기 사는 것과 같은 자리다.
 */
@RestController
@RequestMapping("/api/v1/users/me/image-quota")
@RequiredArgsConstructor
public class UserImageQuotaController {

	private final ImageQuotaService imageQuotaService;

	@GetMapping
	public ResponseEntity<ImageQuotaResponse> quota(Authentication authentication) {
		return ResponseEntity.ok(imageQuotaService.getQuota(Long.valueOf(authentication.getName())));
	}
}
