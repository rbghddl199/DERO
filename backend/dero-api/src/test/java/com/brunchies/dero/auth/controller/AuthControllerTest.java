package com.brunchies.dero.auth.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.auth.service.AuthService;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.auth.service.RefreshCookieWriter;
import com.brunchies.dero.auth.service.RefreshTokenService;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.service.UserService;
import jakarta.servlet.http.Cookie;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 회전·재사용 탐지·로그아웃 배선만 검증한다(ADR-0005 결정 2·4) — 실제 서명·Redis는 각각의 단위·통합
 * 테스트 몫.
 *
 * <p>{@link AuthService}만 진짜를 넣는다({@code @Import}). 흐름(회전 순서·재사용 탐지 시 쿠키 삭제)은
 * 컨트롤러가 아니라 서비스가 갖고 있고, 그 흐름을 HTTP 경계에서 그대로 확인하려면 협력자만 목이어야
 * 한다. {@code AuthService}까지 목으로 만들면 이 파일에 남는 건 위임 한 줄뿐이다.
 */
@WebMvcTest(controllers = AuthController.class)
@Import(AuthService.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private UserService userService;

	@MockitoBean
	private JwtIssuer jwtIssuer;

	@MockitoBean
	private RefreshTokenService refreshTokenService;

	@MockitoBean
	private RefreshCookieWriter cookieWriter;

	@Test
	@DisplayName("쿠키 없이 refresh를 부르면 401 AUTH_REFRESH_INVALID — 회전 시도 자체를 안 한다")
	void 쿠키_없음() throws Exception {
		mockMvc.perform(post("/api/v1/auth/refresh"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_REFRESH_INVALID"));

		verify(refreshTokenService, never()).rotate(anyLong(), anyString(), anyString());
	}

	@Test
	@DisplayName("유효한 리프레시 쿠키면 회전 후 새 액세스 토큰 + 새 리프레시 쿠키를 내려준다")
	void 회전_성공() throws Exception {
		given(jwtIssuer.decodeRefreshToken("old-refresh"))
				.willReturn(new JwtIssuer.DecodedRefreshToken(42L, "old-jti"));
		given(jwtIssuer.issueRefreshToken(42L))
				.willReturn(new JwtIssuer.IssuedRefreshToken("new-refresh", "new-jti"));
		given(refreshTokenService.rotate(42L, "old-jti", "new-jti")).willReturn(true);
		given(userService.getActiveUserRole(42L)).willReturn(UserRole.USER);
		given(jwtIssuer.issueAccessToken(42L, UserRole.USER)).willReturn("new-access-token");

		mockMvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie("refreshToken", "old-refresh")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").value("new-access-token"))
				.andExpect(jsonPath("$.expiresInSeconds").value(JwtIssuer.ACCESS_TTL_SECONDS));

		verify(cookieWriter).write(any(), eq("new-refresh"));
	}

	@Test
	@DisplayName("재사용 탐지(rotate=false)면 쿠키를 지우고 401 AUTH_SESSION_REVOKED")
	void 재사용_탐지() throws Exception {
		given(jwtIssuer.decodeRefreshToken("stolen-refresh"))
				.willReturn(new JwtIssuer.DecodedRefreshToken(42L, "stale-jti"));
		given(jwtIssuer.issueRefreshToken(42L))
				.willReturn(new JwtIssuer.IssuedRefreshToken("new-refresh", "new-jti"));
		given(refreshTokenService.rotate(42L, "stale-jti", "new-jti")).willReturn(false);

		mockMvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie("refreshToken", "stolen-refresh")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_SESSION_REVOKED"));

		verify(cookieWriter).clear(any());
	}

	@Test
	@DisplayName("로그아웃 — 유효한 쿠키면 세션 전체 폐기 후 204")
	void 로그아웃_유효한_쿠키() throws Exception {
		given(jwtIssuer.tryDecodeRefreshToken("old-refresh"))
				.willReturn(Optional.of(new JwtIssuer.DecodedRefreshToken(42L, "old-jti")));

		mockMvc.perform(post("/api/v1/auth/logout").cookie(new Cookie("refreshToken", "old-refresh")))
				.andExpect(status().isNoContent());

		verify(refreshTokenService).revokeAll(42L);
		verify(cookieWriter).clear(any());
	}

	@Test
	@DisplayName("로그아웃 — 무효한 쿠키면 폐기 없이 멱등하게 204 + 쿠키 삭제")
	void 로그아웃_무효한_쿠키() throws Exception {
		given(jwtIssuer.tryDecodeRefreshToken("garbage")).willReturn(Optional.empty());

		mockMvc.perform(post("/api/v1/auth/logout").cookie(new Cookie("refreshToken", "garbage")))
				.andExpect(status().isNoContent());

		verify(refreshTokenService, never()).revokeAll(anyLong());
		verify(cookieWriter).clear(any());
	}

	@Test
	@DisplayName("로그아웃 — 쿠키가 아예 없어도 멱등하게 204")
	void 로그아웃_쿠키_없음() throws Exception {
		mockMvc.perform(post("/api/v1/auth/logout"))
				.andExpect(status().isNoContent());

		verify(refreshTokenService, never()).revokeAll(anyLong());
		verify(cookieWriter).clear(any());
	}
}
