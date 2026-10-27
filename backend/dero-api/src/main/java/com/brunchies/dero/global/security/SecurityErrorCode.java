package com.brunchies.dero.global.security;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * 인증·인가 실패 코드 4종. ADR-0008 결정 4의 표 그대로다.
 *
 * <p><b>{@code AUTH_UNAUTHORIZED}와 {@code AUTH_REFRESH_INVALID}를 가르는 축은 실패 원인(만료냐
 * 위조냐)이 아니라 어느 토큰이 죽었느냐다</b> — 액세스 토큰이 죽으면 프론트는 refresh를 한 번
 * 시도해야 하고, 리프레시 토큰이 죽으면 시도해봐야 같은 401이라 재로그인이 유일한 답이다
 * (DERO-277). 만료냐 위조냐는 여전히 가르지 않는다.
 *
 * <p><b>이 4종이 {@code auth} 도메인이 아니라 {@code global/security}에 있는 이유</b>: 이건 요청 하나를
 * 처리하는 도메인 어휘가 아니라 <b>모든 요청을 가로채는 층</b>의 어휘다. {@code auth}에 두면 {@code global}이
 * 도메인을 참조하게 되어 "{@code global}은 아무도 모른다"(ADR-0007 결정 7)가 깨진다. ADR-0008 결정 3의
 * "global엔 인터페이스만" 문장에서 의도적으로 벗어난 지점이다.
 *
 * <p>{@code AUTH_SESSION_REVOKED}는 {@code AuthController#refresh}가 리프레시 재사용 탐지 시
 * 던진다(ADR-0005 결정 4, 2026-07-29 구현). 프론트 refresh 무한 루프를 끊는 유일한 신호다.
 *
 * <p><b>{@code AUTH_} 접두사를 {@code auth/AuthErrorCode}와 나눠 쓴다.</b> 상수명이 곧 코드
 * 문자열이므로(ADR-0012 결정 6) 여기에 상수를 추가할 때 그쪽과 이름이 겹치지 않는지 확인할 것.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum SecurityErrorCode implements ErrorCode {

	AUTH_UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."),
	AUTH_REFRESH_INVALID(HttpStatus.UNAUTHORIZED, "로그인이 만료되었습니다. 다시 로그인해 주세요."),
	AUTH_SESSION_REVOKED(HttpStatus.UNAUTHORIZED, "세션이 만료되었습니다. 다시 로그인해 주세요."),
	AUTH_FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
