package com.brunchies.dero.auth.controller;

import com.brunchies.dero.auth.dto.RefreshResponse;
import com.brunchies.dero.auth.service.AuthService;
import com.brunchies.dero.auth.service.RefreshCookieWriter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 토큰 재발급·로그아웃(ADR-0005 결정 2·4). 로그인 자체는 컨트롤러가 없다 — Spring이 등록하는
 * {@code /api/oauth2/authorization/{registrationId}}·{@code /api/login/oauth2/code/{registrationId}}와
 * {@code OAuth2LoginSuccessHandler}가 전부 처리한다. 기본 경로가 아니라 {@code /api/} 아래인 이유는
 * {@code SecurityConfig}의 {@code oauth2Login} 주석과 ADR-0005 결정 11에 있다. */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

	private final AuthService authService;

	@PostMapping("/refresh")
	public ResponseEntity<RefreshResponse> refresh(
			@CookieValue(name = RefreshCookieWriter.COOKIE_NAME, required = false) String refreshCookie,
			HttpServletResponse response) {
		return ResponseEntity.ok(authService.refresh(refreshCookie, response));
	}

	/** 멱등 — 이미 지워졌거나 무효한 리프레시로 불러도 조용히 204다(로그아웃 목적은 이미 달성). */
	@PostMapping("/logout")
	public ResponseEntity<Void> logout(
			@CookieValue(name = RefreshCookieWriter.COOKIE_NAME, required = false) String refreshCookie,
			HttpServletResponse response) {
		authService.logout(refreshCookie, response);
		return ResponseEntity.noContent().build();
	}
}
