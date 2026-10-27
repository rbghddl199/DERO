package com.brunchies.dero.user;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/** 소셜 로그인 제공자. 값 집합 정본은 {@code docs/context/erd.md} "열거값" 절이다. */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum Provider {
	KAKAO("카카오 계정으로 로그인한 사용자다."),
	GOOGLE("구글 계정으로 로그인한 사용자다.");

	private final String description;
}
