package com.brunchies.dero.auth.service;

import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * 리프레시 쿠키 굽기/지우기를 한 곳에 모은다 — 로그인 성공 핸들러와 {@code /auth/refresh},
 * {@code /auth/logout}이 전부 같은 모양(httpOnly·Secure·SameSite=Lax·경로·만료)을 써야 한다
 * (ADR-0005 결정 3).
 *
 * <p>{@link #COOKIE_PATH}가 {@code /api/v1/auth/refresh}가 아니라 한 단계 위인 {@code /api/v1/auth}인
 * 이유(ADR-0005 결정 3 개정 절): 로그아웃도 이 쿠키를 필요로 하는데, RFC 6265 §5.1.4 path-match는
 * 요청 경로 {@code /api/v1/auth/logout}을 쿠키 path {@code /api/v1/auth/refresh}에 매치시키지 않는다
 * — 동일하지도 접두사도 아니다. 그래서 브라우저가 로그아웃 요청에 쿠키를 아예 안 실었고,
 * {@code AuthController#logout}은 항상 {@code refreshCookie == null}을 받아
 * {@code RefreshTokenService#revokeAll}을 한 번도 부르지 못했다. 쿠키는 {@code Set-Cookie}가 지우니
 * 화면상 로그아웃으로 보이지만 Redis {@code refresh:{userId}} Set은 TTL 14일이 다 할 때까지 살아 있었다.
 * <b>좁히려면 로그아웃이 리프레시 쿠키 없이 성립하는 설계를 먼저 만들어야 한다.</b>
 */
@Component
public class RefreshCookieWriter {

	public static final String COOKIE_NAME = "refreshToken";

	/** 이 서브트리의 요청에만 쿠키가 실린다. ArchUnit 불변식이 핸들러 매핑 경로를 이 값과 대조한다. */
	public static final String COOKIE_PATH = "/api/v1/auth";
	private static final Duration MAX_AGE = Duration.ofDays(14);

	/** 로컬은 http://localhost라 Secure 쿠키가 안 실린다 — application-local.yaml이 false로 끈다. */
	private final boolean secure;

	public RefreshCookieWriter(@Value("${app.cookie.secure:true}") boolean secure) {
		this.secure = secure;
	}

	public void write(HttpServletResponse response, String token) {
		response.addHeader(HttpHeaders.SET_COOKIE, build(token, MAX_AGE).toString());
	}

	/** 만료된 쿠키를 되돌려보내 브라우저가 즉시 지우게 한다(maxAge=0). */
	public void clear(HttpServletResponse response) {
		response.addHeader(HttpHeaders.SET_COOKIE, build("", Duration.ZERO).toString());
	}

	private ResponseCookie build(String value, Duration maxAge) {
		return ResponseCookie.from(COOKIE_NAME, value)
				.httpOnly(true)
				.secure(secure)
				.sameSite("Lax")
				.path(COOKIE_PATH)
				.maxAge(maxAge)
				.build();
	}
}
