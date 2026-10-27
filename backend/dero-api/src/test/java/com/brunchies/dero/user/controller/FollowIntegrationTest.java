package com.brunchies.dero.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 팔로우·프로필 조회(REQ-COM-07)를 <b>HTTP + 진짜 Postgres</b> 한 방으로 검증한다 — 프론트가 보는
 * 것과 같은 것을 본다({@code OnboardingIntegrationTest}와 같은 시임).
 *
 * <p><b>여기서만 볼 수 있는 것</b>: 멱등성("두 번 눌러도 팔로워 수가 1")은 실제 유니크 제약과
 * 카운트 쿼리가 있어야 성립하고, 🔓 경로의 익명 접근은 실제 필터 체인을 타야 확인된다 —
 * {@code SecurityConfig}의 {@code /users/me} vs {@code /users/*} 선언 순서 회귀도 여기서만 잡힌다.
 */
@AutoConfigureMockMvc
class FollowIntegrationTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	/** Boot 4는 {@code tools.jackson}으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	private User me;
	private User other;

	@BeforeEach
	void setUp() {
		me = users.save(User.create("follower@example.com", Provider.KAKAO, "provider-follower", "나"));
		other = users.save(
				User.create("followee@example.com", Provider.GOOGLE, "provider-followee", "상대"));
	}

	private String bearer(User user) {
		return "Bearer " + jwtIssuer.issueAccessToken(user.getId(), UserRole.USER);
	}

	private JsonNode profileOf(User target, String bearer) throws Exception {
		MvcResult result = (bearer == null
				? mockMvc.perform(get("/api/v1/users/{id}", target.getId()))
				: mockMvc.perform(get("/api/v1/users/{id}", target.getId())
						.header(HttpHeaders.AUTHORIZATION, bearer)))
				.andExpect(status().isOk())
				.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	@Test
	@DisplayName("팔로우를 두 번 눌러도 204이고 팔로워 수는 1이다 — 멱등")
	void 팔로우_멱등() throws Exception {
		for (int i = 0; i < 2; i++) {
			mockMvc.perform(put("/api/v1/users/{id}/follow", other.getId())
							.header(HttpHeaders.AUTHORIZATION, bearer(me)))
					.andExpect(status().isNoContent());
		}

		JsonNode profile = profileOf(other, bearer(me));
		assertThat(profile.get("followerCount").asLong()).isEqualTo(1);
		assertThat(profile.get("following").asBoolean()).isTrue();
	}

	@Test
	@DisplayName("언팔로우는 안 눌린 상태에서도 204이고, 푼 뒤 팔로워 수가 0이다 — 멱등")
	void 언팔로우_멱등() throws Exception {
		mockMvc.perform(delete("/api/v1/users/{id}/follow", other.getId())
						.header(HttpHeaders.AUTHORIZATION, bearer(me)))
				.andExpect(status().isNoContent());

		mockMvc.perform(put("/api/v1/users/{id}/follow", other.getId())
						.header(HttpHeaders.AUTHORIZATION, bearer(me)))
				.andExpect(status().isNoContent());
		mockMvc.perform(delete("/api/v1/users/{id}/follow", other.getId())
						.header(HttpHeaders.AUTHORIZATION, bearer(me)))
				.andExpect(status().isNoContent());

		JsonNode profile = profileOf(other, bearer(me));
		assertThat(profile.get("followerCount").asLong()).isZero();
		assertThat(profile.get("following").asBoolean()).isFalse();
	}

	@Test
	@DisplayName("자기 자신을 팔로우하면 422 USER_SELF_FOLLOW_NOT_ALLOWED")
	void 자기_팔로우_422() throws Exception {
		mockMvc.perform(put("/api/v1/users/{id}/follow", me.getId())
						.header(HttpHeaders.AUTHORIZATION, bearer(me)))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("USER_SELF_FOLLOW_NOT_ALLOWED"));
	}

	@Test
	@DisplayName("없는 사용자를 팔로우하면 404 USER_NOT_FOUND")
	void 없는_사용자_404() throws Exception {
		mockMvc.perform(put("/api/v1/users/{id}/follow", 999_999L)
						.header(HttpHeaders.AUTHORIZATION, bearer(me)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
	}

	@Test
	@DisplayName("팔로우는 로그인이 필요하다 — 토큰 없이 부르면 401")
	void 팔로우_비로그인_401() throws Exception {
		mockMvc.perform(put("/api/v1/users/{id}/follow", other.getId()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("남의 프로필은 비로그인에게도 200이고 following은 false다")
	void 프로필_비로그인_200() throws Exception {
		JsonNode profile = profileOf(other, null);

		assertThat(profile.get("nickname").asText()).isEqualTo("상대");
		assertThat(profile.get("following").asBoolean()).isFalse();
		assertThat(profile.has("email")).isFalse();
	}

	@Test
	@DisplayName("GET /users/me는 익명에게 401이다 — /users/* permitAll이 me까지 열지 않는다")
	void 내_정보는_익명에게_401() throws Exception {
		mockMvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("팔로워·팔로잉 목록은 비로그인에게도 200이고 커서로 이어진다")
	void 목록_커서() throws Exception {
		for (int i = 0; i < 3; i++) {
			User follower = users.save(User.create("f%d@example.com".formatted(i), Provider.KAKAO,
					"provider-f%d".formatted(i), "팔로워%d".formatted(i)));
			mockMvc.perform(put("/api/v1/users/{id}/follow", other.getId())
							.header(HttpHeaders.AUTHORIZATION, bearer(follower)))
					.andExpect(status().isNoContent());
		}

		MvcResult first = mockMvc.perform(
						get("/api/v1/users/{id}/followers", other.getId()).param("size", "2"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(2))
				.andExpect(jsonPath("$.hasNext").value(true))
				.andExpect(jsonPath("$.totalCount").value(3))
				.andReturn();
		String cursor = objectMapper.readTree(first.getResponse().getContentAsString())
				.get("nextCursor").asText();

		mockMvc.perform(get("/api/v1/users/{id}/followers", other.getId())
						.param("size", "2").param("cursor", cursor))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.hasNext").value(false));

		// 반대 방향 — 방금 만든 팔로워 하나가 '상대' 한 명을 팔로우하고 있다.
		mockMvc.perform(get("/api/v1/users/{id}/following", other.getId()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0))
				.andExpect(jsonPath("$.totalCount").value(0));
	}
}
