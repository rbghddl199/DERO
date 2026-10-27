package com.brunchies.dero.user;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** 사용자 역할. 값 집합 정본은 {@code docs/context/erd.md} "열거값" 절이다. */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum UserRole {
	USER("일반 사용자. 가입 시 기본값이다."),
	ADMIN("관리자. /api/v1/admin 트리를 쓸 수 있는 유일한 역할이다.");

	private final String description;
}
