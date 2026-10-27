package com.brunchies.dero.user.controller;

import com.brunchies.dero.user.dto.TermsResponse;
import com.brunchies.dero.user.service.ConsentService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 약관 목록(REQ-USR-01). <b>비로그인도 200이다</b> — 가입 화면이 동의 항목을 그리려면 아직 토큰이
 * 없는 상태에서 이 목록이 필요하다(`docs/context/api-spec.md` §3, 🔓).
 *
 * <p>페이지네이션이 없다. 동의 항목은 코드당 한 줄이고 지금 넷이라 커서도 offset도 의미가 없다.
 */
@RestController
@RequestMapping("/api/v1/terms")
@RequiredArgsConstructor
public class TermsController {

	private final ConsentService consentService;

	/** 항목별 현행 회차 하나씩 → 200. */
	@GetMapping
	public ResponseEntity<List<TermsResponse>> list() {
		return ResponseEntity.ok(consentService.listCurrentTerms());
	}
}
