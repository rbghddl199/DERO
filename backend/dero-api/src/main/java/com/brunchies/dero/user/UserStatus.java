package com.brunchies.dero.user;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** 사용자 상태. 값 집합 정본은 {@code docs/context/erd.md} "열거값" 절이다. */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum UserStatus {
	ACTIVE("활성 계정. 가입 시 기본값이다."),
	INACTIVE("비활성 계정. 탈퇴는 deleted_at이 따로 표현한다.");

	private final String description;
}
