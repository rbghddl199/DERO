package com.brunchies.dero.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.auth.service.RefreshCookieWriter;
import com.brunchies.dero.auth.service.RefreshTokenService;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 세션 수명주기를 <b>HTTP + 진짜 Redis</b>로 검증한다(ADR-0016 결정 3의 기계 검증 표).
 *
 * <p><b>여기 있는 것들은 사람이 브라우저로 밟을 수 없다.</b> 로그아웃이 Redis Set을 실제로 비웠는지는
 * <b>화면에 아무 흔적이 없고</b>(쿠키는 어느 쪽이든 지워져 로그아웃된 것처럼 보인다) — 2026-07-29부터
 * 이번 수정 전까지 {@code RefreshTokenService#revokeAll}이 한 번도 안 불렸던 버그가 숨어 있던 자리가
 * 정확히 여기다({@link RefreshCookieWriter} Javadoc의 쿠키 path 사고). 재사용 탐지도 마찬가지다 —
 * 회전 직후 브라우저는 옛 쿠키를 버려서 그걸 다시 들이밀 방법이 없다.
 *
 * <p>{@link AuthControllerTest}는 {@code @WebMvcTest(addFilters = false)} 슬라이스라 협력자가 전부
 * 목이다 — 배선만 본다. 그래서 <b>Redis에 실제로 무슨 일이 일어났는지</b>는 그 파일을 늘려서는 볼 수
 * 없고 이 통합테스트가 따로 필요하다.
 *
 * <p>Redis 컨테이너는 {@code RefreshTokenServiceTest}와 같은 패턴이다 — 공식 Testcontainers Redis
 * 모듈은 의존성에 없고, 새 의존성 없이 Testcontainers core의 {@link GenericContainer}로 충분하다.
 * Postgres는 {@link AbstractPostgresIntegrationTest}의 싱글턴 컨테이너를 상속해 얻는다.
 *
 * <p><b>{@code @Transactional} 롤백과 MockMvc</b>: 베이스가 {@code @Transactional}이라 테스트가 끝나면
 * DB는 롤백된다. MockMvc는 같은 스레드에서 도는 서블릿 호출이라 요청 핸들러가 <b>테스트 트랜잭션에
 * 그대로 참여한다</b> — {@code setUp}에서 만든 사용자가 요청 안에서 보인다(진짜 소켓을 여는
 * {@code webEnvironment = RANDOM_PORT}였다면 별도 스레드·별도 트랜잭션이라 안 보였을 것이다). 그래서
 * 별도 베이스 클래스를 만들지 않았다. <b>다만 Redis는 롤백 대상이 아니다</b> — 키가 테스트 사이에
 * 남으므로 {@link #tearDown}에서 직접 지운다.
 */
@AutoConfigureMockMvc
@Testcontainers
class AuthSessionIntegrationTest extends AbstractPostgresIntegrationTest {

	@Container
	static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

	static {
		REDIS.start();
	}

	@DynamicPropertySource
	static void redisProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.data.redis.host", REDIS::getHost);
		registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private RefreshTokenService refreshTokens;

	@Autowired
	private StringRedisTemplate redis;

	@Autowired
	private UserRepository users;

	private Long userId;

	@BeforeEach
	void setUp() {
		userId = users.save(
				User.create("session@example.com", Provider.KAKAO, "provider-session", "세션")).getId();
	}

	/** Redis는 테스트 트랜잭션 롤백에 안 걸린다 — 다음 테스트에 세션이 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		redis.delete(sessionKey());
	}

	private String sessionKey() {
		return "refresh:" + userId;
	}

	private Cookie refreshCookie(String token) {
		return new Cookie(RefreshCookieWriter.COOKIE_NAME, token);
	}

	/**
	 * 응답의 {@code Set-Cookie} 헤더에서 리프레시 토큰 값만 꺼낸다. {@code MockHttpServletResponse}가
	 * 헤더를 쿠키로 파싱해 주는지에 기대지 않으려고 원문을 직접 자른다 — 값 뒤에는 항상
	 * {@code "; Path=..."}가 붙는다({@link RefreshCookieWriter}).
	 */
	private String rotatedRefreshToken(MvcResult result) {
		String setCookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
		assertThat(setCookie).startsWith(RefreshCookieWriter.COOKIE_NAME + "=");
		return setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
	}

	@Test
	@DisplayName("로그아웃하면 Redis의 refresh:{userId} Set이 실제로 비워진다 — 화면엔 안 보이는 그 자리")
	void 로그아웃_세션_폐기() throws Exception {
		JwtIssuer.IssuedRefreshToken issued = jwtIssuer.issueRefreshToken(userId);
		refreshTokens.register(userId, issued.jti());
		assertThat(redis.hasKey(sessionKey())).isTrue();

		// Authorization 헤더가 없다 — 로그아웃은 🔒가 아니라 🔓이고 주체는 액세스 토큰이 아니라
		// 리프레시 쿠키다(api-spec.md §2). 여기에 401이 나면 인가 설정이 틀린 것이다.
		mockMvc.perform(post("/api/v1/auth/logout").cookie(refreshCookie(issued.token())))
				.andExpect(status().isNoContent());

		assertThat(redis.hasKey(sessionKey())).isFalse();
	}

	@Test
	@DisplayName("무효한 쿠키로 로그아웃해도 204고, 남의 세션을 지우지 않는다")
	void 로그아웃_무효한_쿠키() throws Exception {
		refreshTokens.register(userId, "jti-alive");

		mockMvc.perform(post("/api/v1/auth/logout").cookie(refreshCookie("not-a-jwt")))
				.andExpect(status().isNoContent());

		assertThat(redis.hasKey(sessionKey())).isTrue();
	}

	@Test
	@DisplayName("회전 성공 — 새 액세스 토큰과 새 리프레시 쿠키가 나오고 Set엔 새 jti 하나만 남는다")
	void 회전_성공() throws Exception {
		JwtIssuer.IssuedRefreshToken issued = jwtIssuer.issueRefreshToken(userId);
		refreshTokens.register(userId, issued.jti());

		MvcResult result = mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(issued.token())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").isNotEmpty())
				.andExpect(jsonPath("$.expiresInSeconds").value(JwtIssuer.ACCESS_TTL_SECONDS))
				.andReturn();

		assertThat(rotatedRefreshToken(result)).isNotEqualTo(issued.token());
		assertThat(redis.opsForSet().size(sessionKey())).isEqualTo(1);
		assertThat(redis.opsForSet().isMember(sessionKey(), issued.jti())).isFalse();
	}

	@Test
	@DisplayName("옛 리프레시 쿠키를 다시 들이밀면 재사용 탐지 — 401이고 회전으로 받은 새 쿠키까지 죽는다")
	void 재사용_탐지_전_기기_무효화() throws Exception {
		JwtIssuer.IssuedRefreshToken issued = jwtIssuer.issueRefreshToken(userId);
		refreshTokens.register(userId, issued.jti());

		MvcResult rotated = mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(issued.token())))
				.andExpect(status().isOk())
				.andReturn();
		String liveToken = rotatedRefreshToken(rotated);

		// 브라우저는 회전 순간 옛 쿠키를 덮어써 버려서 이 요청을 사람이 만들 수 없다 — 탈취본을
		// 재생하는 공격자만 여기 도달한다.
		mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(issued.token())))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_SESSION_REVOKED"));

		assertThat(redis.hasKey(sessionKey())).isFalse();

		// "전 기기 무효화"의 실질 — 방금까지 멀쩡하던 회전본도 같이 죽어야 한다(ADR-0005 결정 4).
		mockMvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(liveToken)))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_SESSION_REVOKED"));
	}

	@Test
	@DisplayName("토큰 없이 보호 API를 부르면 401 AUTH_UNAUTHORIZED — 같은 경로가 토큰이 있으면 200이다")
	void 토큰_없는_보호_API() throws Exception {
		mockMvc.perform(get("/api/v1/users/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));

		// 양성 대조 — 위 401이 "경로가 없어서"가 아니라 "인증이 없어서"임을 못 박는다.
		mockMvc.perform(get("/api/v1/users/me")
						.header(HttpHeaders.AUTHORIZATION,
								"Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.nickname").value("세션"));
	}
}
