package com.brunchies.dero.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.Terms;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 온보딩(닉네임·약관)을 <b>HTTP + 진짜 Postgres</b> 한 방으로 검증한다 —
 * 프론트가 보는 것과 같은 것을 본다({@code AuthSessionIntegrationTest}와 같은 시임).
 *
 * <p><b>여기서만 볼 수 있는 것</b>: {@code onboardingRequired}는 컬럼이 아니라
 * {@code terms}·{@code user_consent} 두 테이블에서 계산되는 파생값이라, 서비스 단위 테스트로는
 * "동의를 기록한 뒤 다시 물으면 false"라는 왕복 자체가 성립하지 않는다. 422일 때 행이 0개인 것도
 * 실제 트랜잭션 경계가 있어야 확인된다.
 *
 * <p>{@code V3__seed_terms.sql}이 넣는 4행이 이미 있으므로 여기서는 약관을 새로 만들지 않고
 * 그 현행 회차를 그대로 쓴다 — 마이그레이션 시드가 죽으면 이 테스트가 같이 죽는 것이 의도다.
 */
@AutoConfigureMockMvc
class OnboardingIntegrationTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long userId;
	private String bearer;

	@BeforeEach
	void setUp() {
		userId = users.save(User.create("onboarding@example.com", Provider.KAKAO,
				"provider-onboarding", "카카오실명")).getId();
		bearer = "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}

	private List<Terms> currentTerms() {
		return entityManager
				.createQuery("""
						SELECT t FROM Terms t
						WHERE t.effectiveAt <= :now
						  AND t.revision = (
						      SELECT MAX(latest.revision) FROM Terms latest
						      WHERE latest.code = t.code AND latest.effectiveAt <= :now)
						""", Terms.class)
				.setParameter("now", OffsetDateTime.now())
				.getResultList();
	}

	private List<Long> requiredTermsIds() {
		return currentTerms().stream().filter(Terms::isRequired).map(Terms::getId).toList();
	}

	private long consentRowCount() {
		entityManager.flush();
		return entityManager
				.createQuery("SELECT COUNT(c) FROM UserConsent c WHERE c.user.id = :userId", Long.class)
				.setParameter("userId", userId)
				.getSingleResult();
	}

	private String termsIdsBody(List<Long> termsIds) {
		return "{\"termsIds\":" + termsIds + "}";
	}

	@Test
	@DisplayName("GET /terms는 비로그인에게도 200이고 항목별 현행 회차 하나씩만 나온다")
	void 약관_목록_비로그인() throws Exception {
		int codeCount = (int) currentTerms().stream().map(Terms::getCode).distinct().count();

		mockMvc.perform(get("/api/v1/terms"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(codeCount))
				.andExpect(jsonPath("$[0].code").isNotEmpty())
				.andExpect(jsonPath("$[0].revision").isNumber());

		// 코드가 겹치지 않는다 = 회차가 하나씩만 실렸다.
		assertThat(codeCount).isEqualTo(currentTerms().size());
	}

	@Test
	@DisplayName("동의를 마치면 GET /users/me의 onboardingRequired가 false로 뒤집힌다")
	void 동의_후_온보딩_불필요() throws Exception {
		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.onboardingRequired").value(true));

		mockMvc.perform(post("/api/v1/users/me/consents")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(termsIdsBody(requiredTermsIds())))
				.andExpect(status().isCreated());

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.onboardingRequired").value(false));
	}

	@Test
	@DisplayName("필수 항목이 빠진 배열은 422이고 user_consent에 아무 행도 안 남는다 — 부분 동의 방지")
	void 필수_누락_422_무변경() throws Exception {
		List<Long> required = requiredTermsIds();
		assertThat(required).hasSizeGreaterThan(1);
		List<Long> missingOne = required.subList(0, required.size() - 1);

		mockMvc.perform(post("/api/v1/users/me/consents")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(termsIdsBody(missingOne)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("USER_REQUIRED_TERMS_NOT_AGREED"));

		assertThat(consentRowCount()).isZero();

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.onboardingRequired").value(true));
	}

	@Test
	@DisplayName("현행 회차가 아닌 termsId를 보내면 422 USER_TERMS_NOT_CURRENT")
	void 현행_아닌_회차() throws Exception {
		mockMvc.perform(post("/api/v1/users/me/consents")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(termsIdsBody(List.of(999_999L))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("USER_TERMS_NOT_CURRENT"));

		assertThat(consentRowCount()).isZero();
	}

	@Test
	@DisplayName("PATCH /users/me로 닉네임을 바꾸면 200이고 다음 조회에 새 값이 나온다")
	void 닉네임_변경() throws Exception {
		mockMvc.perform(patch("/api/v1/users/me")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"nickname\":\"내가정한닉\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.nickname").value("내가정한닉"));

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.nickname").value("내가정한닉"));
	}

	@Test
	@DisplayName("남이 쓰는 닉네임으로 바꾸면 409 USER_NICKNAME_DUPLICATED")
	void 닉네임_중복_409() throws Exception {
		users.save(User.create("taken@example.com", Provider.GOOGLE, "provider-taken", "선점된닉"));

		mockMvc.perform(patch("/api/v1/users/me")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"nickname\":\"선점된닉\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("USER_NICKNAME_DUPLICATED"));

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.nickname").value("카카오실명"));
	}

	@Test
	@DisplayName("동의 기록은 로그인이 필요하다 — 토큰 없이 부르면 401")
	void 동의_비로그인_401() throws Exception {
		mockMvc.perform(post("/api/v1/users/me/consents")
						.contentType(MediaType.APPLICATION_JSON)
						.content(termsIdsBody(requiredTermsIds())))
				.andExpect(status().isUnauthorized());
	}
}
