package com.brunchies.dero.global.exception;

import org.springframework.http.HttpStatus;

/**
 * 에러 코드 계약. 구현은 도메인별 enum이 맡는다(예: {@code product/ProductErrorCode}).
 * 단일 거대 enum을 만들지 않는다 — 근거는 ADR-0008 결정 3.
 */
public interface ErrorCode {

	HttpStatus status();

	/**
	 * 응답 JSON의 확장 필드 {@code code}로 나가는 문자열. <b>구현 enum은
	 * {@code return name();}으로만 구현하고 문자열을 손으로 쓰지 않는다</b> — 도메인 접두사는
	 * 상수명 자체에 넣는다(ADR-0012 결정 6). 인터페이스가 {@code name()}을 알 수 없어
	 * {@code default} 구현을 두지 못하므로 한 줄 오버라이드가 필요하다.
	 */
	String code();

	/** 한국어 필수 — 그대로 사용자 화면에 노출된다. */
	String detail();
}
