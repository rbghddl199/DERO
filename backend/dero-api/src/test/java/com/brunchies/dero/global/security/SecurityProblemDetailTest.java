package com.brunchies.dero.global.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.auth.service.OAuth2LoginFailureHandler;
import com.brunchies.dero.auth.service.OAuth2LoginSuccessHandler;
import com.brunchies.dero.user.UserRole;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 필터 층에서 끊긴 요청도 {@code ProblemDetail}로 나가는지 검증한다.
 * {@code @Component}·{@code @Configuration}은 {@code @WebMvcTest} 타입 필터에서 빠지므로 직접 import 한다.
 *
 * <p>이 테스트는 컨트롤러를 하나도 부르지 않으므로(전부 컨트롤러가 없는 경로로 인증 기본값만 본다)
 * 슬라이스를 {@link SecurityProbeController} 하나로 좁혔다 — 새 컨트롤러가 생겨도 이 테스트는 안
 * 깨지고, 그 서비스 빈을 목으로 채울 필요도 없다.
 *
 * <p>{@code @ActiveProfiles("test")}가 필요해졌다 — {@code SecurityConfig}가 이제
 * {@code JwtConfig}(→ {@code app.jwt.secret})를 요구한다(카카오·구글 로그인 구현).
 */
@WebMvcTest(controllers = SecurityProbeController.class)
@ActiveProfiles("test")
@Import({
	SecurityProbeController.class,
	SecurityConfig.class,
	JwtConfig.class,
	JwtIssuer.class,
	ProblemDetailAuthenticationEntryPoint.class,
	ProblemDetailAccessDeniedHandler.class
})
class SecurityProblemDetailTest {

	@Autowired
	MockMvc mockMvc;

	// 이 둘만 남는다 — 컨트롤러 레이어가 아니라 위에서 import한 SecurityConfig의
	// securityFilterChain 파라미터라 슬라이스를 좁혀도 여전히 필요하다.
	@MockitoBean
	OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;

	@MockitoBean
	OAuth2LoginFailureHandler oAuth2LoginFailureHandler;

	@Autowired
	JwtEncoder jwtEncoder;

	@Autowired
	JwtIssuer jwtIssuer;

	private String accessToken(String typ, Instant issuedAt, Instant expiresAt) {
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject("1")
				.claim("role", UserRole.USER.name())
				.claim("typ", typ)
				.issuedAt(issuedAt)
				.expiresAt(expiresAt)
				.build();
		return jwtEncoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
	}

	private String accessToken(String typ, Instant expiresAt) {
		return accessToken(typ, Instant.now(), expiresAt);
	}

	@Test
	@DisplayName("인증 없이 보호 경로를 부르면 401 AUTH_UNAUTHORIZED + application/problem+json")
	void unauthorized() throws Exception {
		// /api/v1/cart-items는 SecurityConfig의 permitAll 목록 어디에도 없어 .anyRequest().authenticated()로
		// 떨어진다 — 컨트롤러가 아직 없는 경로라 "인증 기본값" 자체만 남는다(있었다면 404였을 것이다).
		mockMvc.perform(get("/api/v1/cart-items"))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"))
				.andExpect(jsonPath("$.detail").value("로그인이 필요합니다."))
				.andExpect(jsonPath("$.instance").value("/api/v1/cart-items"));
	}

	@Test
	@DisplayName("Swagger 경로는 permitAll이라 401로 막히지 않는다")
	void swaggerPathIsPermitted() throws Exception {
		mockMvc.perform(get("/v3/api-docs"))
				.andExpect(status().isNotFound());
	}

	/**
	 * 리프레시·로그아웃의 주체는 Bearer 액세스 토큰이 아니라 리프레시 쿠키다(ADR-0005 결정 3 개정).
	 * 여기가 🔒면 액세스 토큰이 이미 만료된 상태 — 재발급을 부르는 가장 흔한 경우 — 가 401로 막혀
	 * 회전 자체가 성립하지 않는다.
	 */
	@Test
	@DisplayName("POST /api/v1/auth/refresh는 permitAll이라 토큰 없이도 401로 막히지 않는다")
	void 리프레시는_토큰_없이도_통과() throws Exception {
		mockMvc.perform(post("/api/v1/auth/refresh"))
				.andExpect(status().isNotFound());
	}

	/**
	 * 배치 조회의 🔓는 "선택적 인증"이지 "무조건 공개"가 아니다 — 필터는 통과시키고, 응답 범위를
	 * 신원으로 좁히는 건 서비스 몫이다(api-spec.md §4). 여기서는 통과 여부만 본다.
	 */
	@Test
	@DisplayName("GET /api/v1/placements는 permitAll이라 토큰 없이도 401로 막히지 않는다")
	void 배치_조회는_토큰_없이도_통과() throws Exception {
		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isNotFound());
	}

	/** permitAll은 GET 한정이다 — 같은 경로의 쓰기는 계속 보호된다. */
	@Test
	@DisplayName("POST /api/v1/placements는 토큰 없이 401 — permitAll은 GET에만 걸려 있다")
	void 배치_생성은_토큰이_필요하다() throws Exception {
		mockMvc.perform(post("/api/v1/placements"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	/** 카테고리 트리는 비로그인 포함 누구나 본다(탐색·필터는 로그인 전에도 필요하다). */
	@Test
	@DisplayName("GET /api/v1/categories는 permitAll이라 토큰 없이도 401로 막히지 않는다")
	void 카테고리_조회는_토큰_없이도_통과() throws Exception {
		mockMvc.perform(get("/api/v1/categories"))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("POST /api/v1/categories는 토큰 없이 401 — permitAll은 GET에만 걸려 있다")
	void 카테고리_생성은_토큰이_필요하다() throws Exception {
		mockMvc.perform(post("/api/v1/categories"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	/** 상판 재질 미리보기도 비로그인 포함 누구나 본다(책상 커스터마이징 미리보기는 로그인 전에도 떠야 한다). */
	@Test
	@DisplayName("GET /api/v1/desk-textures는 permitAll이라 토큰 없이도 401로 막히지 않는다")
	void 상판재질_조회는_토큰_없이도_통과() throws Exception {
		mockMvc.perform(get("/api/v1/desk-textures"))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("POST /api/v1/desk-textures는 토큰 없이 401 — permitAll은 GET에만 걸려 있다")
	void 상판재질_생성은_토큰이_필요하다() throws Exception {
		mockMvc.perform(post("/api/v1/desk-textures"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	/** Jenkins Verify가 nginx를 안 거치고 이 경로를 직접 친다(compose.yaml 주석) — 막으면 배포 검증이 죽는다. */
	@Test
	@DisplayName("/api/actuator/health는 permitAll이라 토큰 없이도 401로 막히지 않는다")
	void 액추에이터_헬스는_토큰_없이도_통과() throws Exception {
		mockMvc.perform(get("/api/actuator/health"))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("typ=access인 유효한 토큰이면 필터를 통과한다 — 컨트롤러가 없어 404지 401이 아니다")
	void 유효한_액세스_토큰은_통과() throws Exception {
		String token = accessToken("access", Instant.now().plus(30, ChronoUnit.MINUTES));

		mockMvc.perform(get("/api/v1/cart-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("typ=refresh 토큰으로 보호 경로를 부르면 401 — 리소스 서버 디코더가 typ=access만 통과시킨다")
	void 리프레시_typ_토큰은_거절() throws Exception {
		String token = accessToken("refresh", Instant.now().plus(30, ChronoUnit.MINUTES));

		mockMvc.perform(get("/api/v1/cart-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	@Test
	@DisplayName("만료된 토큰은 401")
	void 만료된_토큰은_거절() throws Exception {
		String token = accessToken(
				"access", Instant.now().minus(2, ChronoUnit.MINUTES), Instant.now().minus(1, ChronoUnit.MINUTES));

		mockMvc.perform(get("/api/v1/cart-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	@Test
	@DisplayName("서명이 깨진(변조) 토큰은 401")
	void 변조된_토큰은_거절() throws Exception {
		String token = accessToken("access", Instant.now().plus(30, ChronoUnit.MINUTES));
		// 마지막 문자를 뒤집으면 안 된다 — HS256 서명 43자의 마지막 base64url 문자는 하위 2비트가
		// 버려지는 패딩이라, 토큰이 A~D로 끝나는 런(4/64 확률)에선 뒤집어도 서명이 그대로 유효해
		// 이 테스트가 플레이키해진다(2026-08-02 develop 통합 런에서 실측 — 404로 실패).
		// 서명 중간 문자는 6비트 전부가 서명 비트라 어떤 치환이든 반드시 검증이 깨진다.
		int middleOfSignature = token.lastIndexOf('.') + 5;
		char original = token.charAt(middleOfSignature);
		String tampered = token.substring(0, middleOfSignature) + (original == 'a' ? 'b' : 'a')
				+ token.substring(middleOfSignature + 1);

		mockMvc.perform(get("/api/v1/cart-items").header(HttpHeaders.AUTHORIZATION, "Bearer " + tampered))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	// --- 관리자 트리 선제 잠금(/api/v1/admin/**) ---
	// 나머지 경로가 아직 permitAll이라(위 unauthorized()가 @Disabled인 이유) 인가 규칙이 실제로
	// 도는 곳은 지금 이 트리뿐이다. 컨트롤러는 슬라이스 밖이라 통과의 증거는 404다.

	@Test
	@DisplayName("토큰 없이 관리자 경로를 부르면 401 AUTH_UNAUTHORIZED + application/problem+json")
	void 관리자_경로는_무토큰이면_401() throws Exception {
		mockMvc.perform(get("/api/v1/admin/products"))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"))
				.andExpect(jsonPath("$.instance").value("/api/v1/admin/products"));
	}

	@Test
	@DisplayName("role=USER 토큰으로 관리자 경로를 부르면 403 AUTH_FORBIDDEN")
	void 관리자_경로는_USER_토큰이면_403() throws Exception {
		String token = jwtIssuer.issueAccessToken(1L, UserRole.USER);

		mockMvc.perform(get("/api/v1/admin/products").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
				.andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(403))
				.andExpect(jsonPath("$.code").value("AUTH_FORBIDDEN"));
	}

	@Test
	@DisplayName("role=ADMIN 토큰이면 인가를 통과한다 — 컨트롤러가 슬라이스 밖이라 404지 401·403이 아니다")
	void 관리자_경로는_ADMIN_토큰이면_통과() throws Exception {
		String token = jwtIssuer.issueAccessToken(1L, UserRole.ADMIN);

		mockMvc.perform(get("/api/v1/admin/products").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
				.andExpect(status().isNotFound());
	}
}
