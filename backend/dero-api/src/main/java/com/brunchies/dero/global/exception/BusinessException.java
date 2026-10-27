package com.brunchies.dero.global.exception;

import java.util.List;

/**
 * 업무 예외는 이 클래스 하나다(ADR-0008 결정 3). 도메인별 예외 클래스를 만들지 않는다 —
 * 잡아서 다르게 처리해야 할 예외가 생기면 그때 따로 만든다.
 *
 * <p>{@code errors}는 검증 실패(400) 전용이 아니다 — ADR-0009 §6처럼 422 응답에 위반 목록을 실어야
 * 하는 도메인 규칙도 같은 자리를 쓴다. {@code global}이 도메인 어휘(예: 위반 코드)를 몰라도 되도록
 * 타입을 {@code List<?>}로 열어 둔다.
 */
public class BusinessException extends RuntimeException {

	private final ErrorCode errorCode;
	private final List<?> errors;

	public BusinessException(ErrorCode errorCode) {
		this(errorCode, List.of());
	}

	public BusinessException(ErrorCode errorCode, List<?> errors) {
		super(errorCode.code());
		this.errorCode = errorCode;
		this.errors = errors;
	}

	public ErrorCode getErrorCode() {
		return errorCode;
	}

	public List<?> getErrors() {
		return errors;
	}
}
