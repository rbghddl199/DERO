package com.brunchies.dero.global.security;

import com.brunchies.dero.auth.service.OAuth2LoginFailureHandler;
import com.brunchies.dero.auth.service.OAuth2LoginSuccessHandler;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 필터 체인 배선(ADR-0005 구현 — 카카오·구글 로그인).
 *
 * <p>인증 실패 핸들러(401·403) 등록을 {@code exceptionHandling}이 아니라
 * {@code oauth2ResourceServer(...)} 안에 둔다 — 안 그러면 Spring 기본
 * {@code BearerTokenAuthenticationEntryPoint}가 먼저 잡아 바디 없는 401이 나간다(ADR-0005 결정 9,
 * 이전까지 이 클래스의 주석이 경고하던 그 지점).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

	@Bean
	public SecurityFilterChain securityFilterChain(
			HttpSecurity http,
			ProblemDetailAuthenticationEntryPoint authenticationEntryPoint,
			ProblemDetailAccessDeniedHandler accessDeniedHandler,
			CorsConfigurationSource corsConfigurationSource,
			JwtDecoder jwtDecoder,
			OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler,
			OAuth2LoginFailureHandler oAuth2LoginFailureHandler)
			throws Exception {
		return http
				.cors(cors -> cors.configurationSource(corsConfigurationSource))
				// Bearer 전용 API라 브라우저가 자동으로 붙이는 자격 증명이 없다(ADR-0005 "인가 규칙과 CSRF").
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(
						session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				// 기본은 닫는다(.anyRequest().authenticated()). 아래 permitAll은 "아직 우리 토큰이
				// 없거나 있을 수 없는 자리"만 골라 연 것이고, 정본은 docs/context/api-spec.md의 🔓/🔒 표다.
				.authorizeHttpRequests(authorize -> authorize
						// admin 트리는 아래 permitAll보다 반드시 앞에 온다 — 규칙은 선언 순서대로
						// 평가돼서 permitAll 뒤에 두면 절대 도달하지 않는다.
						.requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
						// 로그인 시작·콜백. 액세스 토큰을 발급받으러 오는 길이라 막으면 로그인 자체가 없다.
						// Spring 기본 경로가 아니라 `/api/` 아래다 — nginx가 백엔드로 넘기는 location이
						// `/api/` 하나뿐이라 기본 경로는 배포에서 Next.js가 받아 404가 된다(ADR-0005 결정 11).
						.requestMatchers(
								"/api/oauth2/authorization/**", "/api/login/oauth2/code/**")
						.permitAll()
						// 이 둘의 주체는 Bearer 액세스 토큰이 아니라 리프레시 쿠키다(ADR-0005 결정 3 개정).
						// 🔒로 두면 액세스 토큰이 이미 만료된 상태 — 재발급·로그아웃을 부르는 가장 흔한
						// 경우 — 가 401로 막혀 회전 자체가 성립하지 않는다.
						.requestMatchers(
								HttpMethod.POST, "/api/v1/auth/refresh", "/api/v1/auth/logout")
						.permitAll()
						// Jenkins Verify가 nginx를 거치지 않고 127.0.0.1:8081/api/actuator/health를 직접
						// 친다(compose.yaml 주석). 막으면 배포 검증이 401로 죽는다.
						.requestMatchers("/api/actuator/**").permitAll()
						// 문서 자체는 local 프로파일에서만 켜진다(application.yaml이 springdoc을 닫아 둔다) —
						// 여기서 열어도 운영엔 서빙할 것이 없다.
						.requestMatchers(
								"/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**")
						.permitAll()
						// 배치 조회의 🔓는 "선택적 인증"이지 "무조건 공개"가 아니다 — 비로그인은 PUBLIC만,
						// 로그인은 PUBLIC + 본인 소유 비공개까지 본다(api-spec.md §4). 응답 범위를 신원으로
						// 좁히는 건 서비스 몫이고 여기서는 통과만 시킨다.
						// GET 한정이라 같은 경로의 PUT·DELETE는 계속 보호되고, `*`는 한 세그먼트만
						// 매치하므로 /{id}/thumbnail 같은 하위 경로도 열리지 않는다.
						.requestMatchers(
								HttpMethod.GET, "/api/v1/placements", "/api/v1/placements/*")
						.permitAll()
						// 상상도 조회도 같은 선택적 인증이다(api-spec.md §4의 🔓). 위 규칙의 `*`가
						// 한 세그먼트만 매치해서 하위 경로를 안 열기 때문에 따로 적는다 —
						// GET 한정이라 같은 접두사의 feed-entry PUT·DELETE는 그대로 막힌다.
						.requestMatchers(
								HttpMethod.GET, "/api/v1/placements/*/generated-images")
						.permitAll()
						// 댓글 목록도 같은 "선택적 인증" 🔓다(api-spec.md §4). 위 줄로는 안 열린다 —
						// `*`가 한 세그먼트만 매치해서 /{id}/comments까지 닿지 않는다. GET 한정이라
						// 작성(POST)·삭제(DELETE)는 계속 보호된다.
						.requestMatchers(HttpMethod.GET, "/api/v1/placements/*/comments").permitAll()
						// 게시글 좋아요 상태 조회는 신원이 곧 답이라 아래 게시글 permitAll보다
						// 앞에 온다 — 뒤에 두면 익명 호출이 401 대신 200 + liked=false를 받는다
						// (GET /products/*/like와 같은 함정, 순서가 규칙이다).
						.requestMatchers(HttpMethod.GET, "/api/v1/posts/*/like").authenticated()
						// 게시글 목록·상세는 비로그인에게도 200이다(api-spec.md §6의 🔓, D14).
						// 게시글엔 배치 같은 게시 상태가 없어 신원으로 좁힐 범위 자체가 없다.
						// GET 한정이라 같은 경로의 POST·PUT·DELETE는 계속 보호되고, `*`가 한
						// 세그먼트만 매치하므로 /{id}/images·/{id}/comments는 열리지 않는다.
						.requestMatchers(HttpMethod.GET, "/api/v1/posts", "/api/v1/posts/*")
						.permitAll()
						// 데스크피드 좋아요 상태 조회도 신원이 곧 답이라 아래 permitAll보다 앞에 온다
						// (/posts/*/like·/products/*/like와 같은 순서 함정).
						.requestMatchers(HttpMethod.GET, "/api/v1/desk-feeds/*/like").authenticated()
						// 데스크피드 목록·상세·댓글 목록은 비로그인에게도 200이다(api-spec.md §6-보의
						// 🔓, D14). 게시 상태가 없어 신원으로 좁힐 범위 자체가 없다. GET 한정이라 같은
						// 경로의 POST·PUT·DELETE는 계속 보호되고, `*`가 한 세그먼트만 매치하므로
						// /{id}/comments는 별도 줄이다(/placements/*/comments와 같은 자리).
						.requestMatchers(HttpMethod.GET, "/api/v1/desk-feeds", "/api/v1/desk-feeds/*")
						.permitAll()
						.requestMatchers(HttpMethod.GET, "/api/v1/desk-feeds/*/comments").permitAll()
						// 리믹스 목록도 같은 선택적 인증 🔓다 — 위 `*` 규칙이 한 세그먼트만 매치해서
						// 여기까지 안 닿는다. GET 한정이라 리믹스 생성(POST)은 계속 보호된다.
						.requestMatchers(HttpMethod.GET, "/api/v1/placements/*/remixes").permitAll()
						// 견적도 같은 "선택적 인증" 🔓다(api-spec.md §4). 역시 위 `*` 규칙으로는 안 열린다.
						// 남의 비공개 배치 견적은 서비스의 가시성 게이트가 404로 막는다.
						.requestMatchers(HttpMethod.GET, "/api/v1/placements/*/estimate").permitAll()
						// 찜 상태 조회는 신원이 곧 답이라 아래 카탈로그 permitAll보다 앞에 온다 —
						// 뒤에 두면 규칙이 선언 순서대로 평가돼 절대 도달하지 않고, 익명 호출이
						// 401 대신 200 + liked=false로 답해 프론트가 재로그인 시점을 놓친다.
						.requestMatchers(HttpMethod.GET, "/api/v1/products/*/like").authenticated()
						// 호환성 판정은 저장하지 않는 계산이라 비로그인에게도 200이다(api-spec.md §8,
						// ADR-0004 "판정 결과 저장 — 안 함"). 구매 전에 "이 조합이 되나"를 묻는 자리라
						// 아직 배치도 계정도 없는 사용자가 주 사용자다. POST 한정이고 경로도 단수
						// 하위가 아니라 정확히 이 하나라, 이 규칙이 다른 쓰기를 같이 열지 않는다.
						.requestMatchers(HttpMethod.POST, "/api/v1/compatibility/judgments")
						.permitAll()
						// 카탈로그 열람은 비로그인에게도 연다(D14). GET 한정이라 같은 접두사의 자작 제품
						// 업로드·이미지 presign(POST)은 그대로 막힌다.
						.requestMatchers(HttpMethod.GET, "/api/v1/products/**").permitAll()
						// 약관 목록은 가입 화면이 그린다 — 아직 우리 토큰이 없는 자리다(api-spec.md §3 🔓).
						// 동의 기록(POST /users/me/consents)은 이 규칙 밖이라 계속 보호된다.
						.requestMatchers(HttpMethod.GET, "/api/v1/terms").permitAll()
						// `/users/me` 트리는 아래 `/users/*` permitAll보다 반드시 앞에 온다 — `*`가
						// "me"에도 매치해서, 뒤에 두면 내 정보 조회가 익명에게 열리고
						// UserController.userId()의 Long.valueOf("anonymousUser")가 500이 된다.
						// 규칙은 선언 순서대로 평가된다(admin 트리·products/*/like와 같은 자리).
						.requestMatchers("/api/v1/users/me", "/api/v1/users/me/**").authenticated()
						// 닉네임 자동완성(멘션, D35·ADR-0038 결정 3)도 같은 이유로 `/users/*`
						// permitAll보다 앞에 온다 — 뒤에 두면 `*`가 "search"에 매치해 비로그인
						// 닉네임 열거 통로가 열린다(그것을 막는 것이 로그인 필수의 유일한 목적이다).
						.requestMatchers(HttpMethod.GET, "/api/v1/users/search").authenticated()
						// 남의 프로필과 팔로워·팔로잉 목록은 🔓다(api-spec.md §3) — 프로필 화면이
						// 로그인 전에도 떠야 한다(D14). GET 한정이라 같은 경로의 팔로우
						// PUT·DELETE는 계속 보호되고, `*`가 한 세그먼트만 매치하므로 하위 경로는
						// 아래 두 줄로 따로 연다.
						.requestMatchers(HttpMethod.GET, "/api/v1/users/*").permitAll()
						.requestMatchers(
								HttpMethod.GET, "/api/v1/users/*/followers", "/api/v1/users/*/following")
						.permitAll()
						// 카테고리·상판 재질 마스터 목록도 카탈로그 탐색의 일부라 같은 이유로 연다
						// (DERO-325) — 배치 화면의 카테고리 필터·재질 선택 UI가 로그인 전에도
						// 떠야 한다. 두 리소스 모두 관리자 CRUD(POST/PATCH/DELETE)는 /admin 트리에만
						// 있어 이 permitAll이 그쪽까지 열지 않는다.
						.requestMatchers(HttpMethod.GET, "/api/v1/categories", "/api/v1/desk-textures")
						.permitAll()
						// presigned URL의 수신부(app.storage.mode=local). 인가는 URL의 HMAC 서명이
						// 전부라 Bearer 토큰이 낄 자리가 없다 — 브라우저가 S3에 직접 올리는 자리를
						// WAS가 대신 받는 것이라 S3 엔드포인트에 토큰을 붙이지 않는 것과 같은 결이다.
						// 막으면 2단계 업로드의 ②(스토리지 PUT)가 401로 죽는다(infra/CLAUDE.md).
						// LocalFileController.BASE_PATH를 참조하지 않고 문자열로 적는다 — global이
						// infra를 import하면 LayerDependencyTest의 freeze된 규칙에 새 위반이 된다.
						// 저쪽 상수를 바꾸면 여기도 바꿔야 한다.
						.requestMatchers("/api/v1/local-files/**").permitAll()
						// 이미지 안정 공개 URL(ADR-0035). 인가 없는 공개 조회가 설계다 — 프리픽스
						// 화이트리스트는 PublicImageController가 건다. 문자열로 적는 이유는 위
						// local-files와 같다(global→infra import 금지).
						.requestMatchers(HttpMethod.GET, "/api/v1/images/**").permitAll()
						.anyRequest().authenticated())
				.oauth2Login(oauth2 -> oauth2
						// 두 엔드포인트를 `/api/` 아래로 옮긴다(ADR-0005 결정 11) — 각 registration의
						// redirect-uri(application-*.yaml)와 셋이 한 세트라 하나만 옮기면 어긋난다.
						// redirectionEndpoint의 `/*`는 필수다 — Spring이 그 자리에서 registrationId를 뽑는다.
						.authorizationEndpoint(authorization -> authorization
								.baseUri("/api/oauth2/authorization"))
						.redirectionEndpoint(redirection -> redirection
								.baseUri("/api/login/oauth2/code/*"))
						.successHandler(oAuth2LoginSuccessHandler)
						.failureHandler(oAuth2LoginFailureHandler))
				.oauth2ResourceServer(oauth2 -> oauth2
						.jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter()))
						.authenticationEntryPoint(authenticationEntryPoint)
						.accessDeniedHandler(accessDeniedHandler))
				.build();
	}

	/** {@code role} 클레임 → {@code ROLE_}접두사 권한(ADR-0005 결정 10) — {@code hasRole("ADMIN")}이 그대로 동작한다. */
	private Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter() {
		JwtGrantedAuthoritiesConverter authoritiesConverter = new JwtGrantedAuthoritiesConverter();
		authoritiesConverter.setAuthorityPrefix("ROLE_");
		authoritiesConverter.setAuthoritiesClaimName("role");

		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
		return converter;
	}

	/**
	 * {@code app.cors.allowed-origins}(콤마 구분) 기반 CORS 설정 — 안전 기본값은 빈 문자열(전부 차단),
	 * {@code application-local.yaml}만 {@code http://localhost:3000}으로 연다(ADR-0005 "로컬 개발에는
	 * CORS가 필요하다"). 운영(nginx 뒤 동일 오리진)은 열 필요가 없어 프로필별로 갈린다.
	 *
	 * <p>리프레시 쿠키를 크로스 오리진으로 주고받아야 해서 {@code allowCredentials}가 정확한 오리진
	 * 지정과 함께 필요하다(ADR-0005). 와일드카드 오리진과는 같이 못 쓰므로(스프링이 기동 시 예외로
	 * 막는다) 안전하다.
	 */
	@Bean
	public CorsConfigurationSource corsConfigurationSource(
			@Value("${app.cors.allowed-origins:}") String[] allowedOrigins) {
		List<String> origins = Arrays.stream(allowedOrigins)
				.map(String::trim)
				.filter(origin -> !origin.isBlank())
				.toList();

		CorsConfiguration configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(origins);
		configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		configuration.setAllowedHeaders(List.of("*"));
		configuration.setAllowCredentials(true);

		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}
}
