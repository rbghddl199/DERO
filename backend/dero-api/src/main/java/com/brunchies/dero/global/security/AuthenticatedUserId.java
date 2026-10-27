package com.brunchies.dero.global.security;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * {@code Authentication}에서 우리 {@code user.id}를 꺼낸다. 컨트롤러가 신원을 서비스로 넘길 때 쓴다 —
 * {@link com.brunchies.dero.global.config.JpaAuditingConfig#auditorAware}가 감사 컬럼용으로 하는 것과
 * 같은 판별을 HTTP 핸들러 쪽에서 반복하지 않으려고 여기 한 곳에 모았다.
 *
 * <p><b>반드시 타입으로 가른다.</b> {@link JwtAuthenticationToken}이 아닌 인증을 믿으면 안 된다 —
 * {@code OAuth2AuthenticationToken#getName()}은 카카오 자체 회원번호·구글 {@code sub}를 돌려주는데
 * 둘 다 숫자처럼 생겨서 {@code Long.valueOf}가 <b>예외 없이 성공한다</b>. 남의 제공자 회원번호가 우리
 * {@code user.id} 자리에 조용히 박히는 경로다(그 사고 시나리오 전문은 {@code JpaAuditingConfig} Javadoc).
 *
 * <p><b>익명이면 {@code null}이다</b>(예외가 아니다). {@code permitAll} 경로는 신원 없이도 성립해야 하고
 * (배치 목록·상세의 선택적 인증, {@code docs/context/api-spec.md} §4), 그런 경로엔 스프링이
 * {@code AnonymousAuthenticationToken}({@code getName()}이 {@code "anonymousUser"})을 넣어 준다 —
 * null 검사만 하는 코드는 여기서 {@code NumberFormatException}으로 터진다. 필터를 끈
 * {@code @WebMvcTest}에서는 인자 자체가 {@code null}로 들어오므로 그 경우도 같이 받는다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class AuthenticatedUserId {

	/** 로그인 사용자의 {@code user.id}. 익명·비 JWT 인증이면 {@code null}. */
	public static Long orNull(Authentication authentication) {
		if (!(authentication instanceof JwtAuthenticationToken jwtAuth) || !jwtAuth.isAuthenticated()) {
			return null;
		}
		return Long.valueOf(jwtAuth.getName());
	}
}
