package com.brunchies.dero.global.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.springframework.http.ProblemDetail;

/**
 * {@link ProblemDetail} 생성 창구. {@link GlobalExceptionHandler}와 시큐리티 실패 핸들러 둘이
 * <b>같이</b> 쓴다(ADR-0008 결정 4). {@code ProblemDetail}을 손으로 만들지 말고 항상 여기를 통과시켜라
 * — 통과해야 한국어 {@code detail}과 확장 필드 {@code code}가 보장된다.
 *
 * <p>{@code type}은 Spring 기본값 {@code about:blank}, {@code title}은 상태 코드의 reason phrase가
 * 자동으로 채워진다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ProblemDetails {

	public static ProblemDetail of(ErrorCode errorCode, HttpServletRequest request) {
		ProblemDetail problemDetail =
				ProblemDetail.forStatusAndDetail(errorCode.status(), errorCode.detail());
		problemDetail.setProperty("code", errorCode.code());
		problemDetail.setInstance(URI.create(request.getRequestURI()));
		return problemDetail;
	}
}
