package com.brunchies.dero.placement.controller;

import com.brunchies.dero.placement.dto.JudgmentRequest;
import com.brunchies.dero.placement.dto.JudgmentResponse;
import com.brunchies.dero.placement.service.CompatibilityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 호환성 판정 — <b>계산이지 리소스 생성이 아니다</b>(api-spec.md §8).
 *
 * <p><b>새 톱레벨 패키지를 만들지 않는다</b>(ADR-0007) — 경로는 {@code /compatibility}지만 코드는
 * {@code placement} 도메인 안에 산다. 판정의 입력이 배치의 입력과 같은 것들이고, 저장 경로
 * ({@code PlacementService})가 같은 순수 함수를 부르기 때문이다.
 *
 * <p><b>{@code POST}인데 200이고 {@code Location}이 없다</b> — 상태가 안 남는 계산은 네임스페이스 +
 * 복수 명사 + {@code POST}이고, 만들어진 리소스가 없어 줄 주소가 없다(§1 규칙 1⑵).
 * {@code /judge} 같은 동사 경로는 쓰지 않는다.
 *
 * <p><b>비로그인도 200이다.</b> 아직 배치를 만들지 않은 사용자가 구매 전에 묻는 자리라 신원이 필요
 * 없다 — {@code SecurityConfig}가 이 경로를 {@code POST} 한정으로 열어 둔다.
 */
@RestController
@RequestMapping("/api/v1/compatibility")
@RequiredArgsConstructor
public class CompatibilityController {

	private final CompatibilityService compatibilityService;

	/** 판정 3종을 한 번에 돌려준다 → 200. 아무것도 저장하지 않는다. */
	@PostMapping("/judgments")
	public ResponseEntity<JudgmentResponse> judge(@Valid @RequestBody JudgmentRequest request) {
		return ResponseEntity.ok(compatibilityService.judge(request));
	}
}
