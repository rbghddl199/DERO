package com.brunchies.dero.auth;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * 인증 도메인 에러 코드. 필터 층(로그인 성공 핸들러)에서 쓰이는 코드는
 * {@code @RestControllerAdvice}를 안 타므로(ADR-0005 결정 9) {@code ProblemDetail}로 직렬화되지 않고
 * {@link #code()} 값이 콜백 리다이렉트의 {@code ?error=} 쿼리파라미터로만 쓰인다.
 *
 * <p><b>{@code AUTH_} 접두사를 {@code global/security/SecurityErrorCode}와 나눠 쓴다.</b> 상수명이 곧
 * 코드 문자열이므로(ADR-0012 결정 6) 여기에 상수를 추가할 때 그쪽과 이름이 겹치지 않는지 확인할 것 —
 * 겹치면 서로 다른 두 enum이 같은 코드를 발행해 프론트 분기가 조용히 갈린다.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum AuthErrorCode implements ErrorCode {

	AUTH_EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT,
			"이미 다른 방법으로 가입된 이메일입니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
