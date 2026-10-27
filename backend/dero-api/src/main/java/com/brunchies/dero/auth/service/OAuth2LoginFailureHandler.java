package com.brunchies.dero.auth.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

/**
 * Spring이 인가코드 교환 자체를 실패시킨 경우(사용자 동의 거부, state 불일치 등) — 우리 성공 핸들러
 * 안까지 못 온 실패라 {@link OAuth2LoginSuccessHandler}의 이메일 충돌 리다이렉트와는 별도 경로다.
 */
@Component
public class OAuth2LoginFailureHandler implements AuthenticationFailureHandler {

	private final String successRedirectUri;

	public OAuth2LoginFailureHandler(
			@Value("${app.oauth.success-redirect-uri}") String successRedirectUri) {
		this.successRedirectUri = successRedirectUri;
	}

	@Override
	public void onAuthenticationFailure(
			HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
			throws IOException {
		response.sendRedirect(successRedirectUri + "?error=OAUTH_FAILED");
	}
}
