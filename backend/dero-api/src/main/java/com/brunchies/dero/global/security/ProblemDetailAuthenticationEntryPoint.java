package com.brunchies.dero.global.security;

import com.brunchies.dero.global.exception.ProblemDetails;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 401 응답을 {@link ProblemDetail}로 낸다. 인증 실패는 필터 층에서 끊기므로
 * {@code @RestControllerAdvice}에 잡히지 않는다(ADR-0005 결정 9) — 그래서 여기서 직접 쓴다.
 * 대신 바디는 {@link ProblemDetails} 공유 팩터리를 통과시켜 advice와 모양을 맞춘다(ADR-0008 결정 4).
 *
 * <p>Spring이 붙이는 {@code WWW-Authenticate} 헤더는 지우지 않는다 — RFC 9110 §15.5.2가 401에 필수로
 * 요구한다.
 */
@Component
public class ProblemDetailAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ObjectMapper objectMapper;

	public ProblemDetailAuthenticationEntryPoint(ObjectMapper objectMapper) {
		this.objectMapper = objectMapper;
	}

	@Override
	public void commence(
			HttpServletRequest request,
			HttpServletResponse response,
			AuthenticationException authenticationException)
			throws IOException {
		ProblemDetail body = ProblemDetails.of(SecurityErrorCode.AUTH_UNAUTHORIZED, request);
		response.setStatus(SecurityErrorCode.AUTH_UNAUTHORIZED.status().value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		objectMapper.writeValue(response.getWriter(), body);
	}
}
