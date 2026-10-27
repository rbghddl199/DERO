package com.brunchies.dero.global.exception;

/**
 * 검증 실패 400의 {@code errors} 배열 원소. 맵({@code {"field":"reason"}})이 아니라 배열인 이유는
 * 같은 필드에 오류가 2개일 수 있어 맵이 하나를 잃기 때문이다(ADR-0008 결정 2).
 */
public record FieldErrorDetail(String field, String reason) {
}
