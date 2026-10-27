package com.brunchies.dero.placement.controller;

import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.placement.dto.EstimateResponse;
import com.brunchies.dero.placement.service.PlacementEstimateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 견적 조회({@code api-spec.md} §4, REQ-REC-01).
 *
 * <p><b>🔓는 "선택적 인증"이지 "무조건 공개"가 아니다</b> — 남의 비공개 배치 견적은 404다. 그래서
 * 신원을 {@link AuthenticatedUserId#orNull}로 nullable하게 꺼내 서비스에 넘긴다: 익명 경로의
 * {@code Authentication}은 {@code null}이 아니라 {@code AnonymousAuthenticationToken}이라
 * {@code Long.valueOf(auth.getName())}은 500이 된다.
 *
 * <p>{@link PlacementController}와 파일을 나눈 이유는 서비스와 같다 — 저장 경로와 공유하는 것이
 * 경로 접두사뿐이다.
 */
@RestController
@RequestMapping("/api/v1/placements")
@RequiredArgsConstructor
public class PlacementEstimateController {

	private final PlacementEstimateService placementEstimateService;

	/** 견적 → 200. 저장하는 게 없어 계산 결과만 돌려준다. */
	@GetMapping("/{placementId}/estimate")
	public ResponseEntity<EstimateResponse> estimate(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(placementEstimateService.estimate(
				placementId, AuthenticatedUserId.orNull(authentication)));
	}
}
