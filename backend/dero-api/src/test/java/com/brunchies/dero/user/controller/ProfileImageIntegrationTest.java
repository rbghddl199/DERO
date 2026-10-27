package com.brunchies.dero.user.controller;

import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 프로필 이미지 2단계 presign(api-spec.md §3)을 <b>HTTP + 진짜 Postgres</b>로 검증한다.
 *
 * <p><b>여기서만 볼 수 있는 것</b>: 등록한 key가 다음 조회에서 presigned GET URL로 조립돼 나오는
 * 왕복이다 — 응답에 key가 아니라 URL이 실리는 것이 계약이라(user/CLAUDE.md) 서비스 단위 테스트로는
 * 그 왕복이 성립하지 않는다.
 */
@AutoConfigureMockMvc
class ProfileImageIntegrationTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	private Long userId;
	private String bearer;

	@BeforeEach
	void setUp() {
		userId = users.save(User.create("avatar@example.com", Provider.KAKAO, "provider-avatar",
				"프사주인")).getId();
		bearer = "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}

	@Test
	@DisplayName("presign은 200이고 key가 profile-images/{userId}/{uuid}.webp 버전 key다(ADR-0035)")
	void presign_200() throws Exception {
		mockMvc.perform(post("/api/v1/users/me/profile-image/upload-url")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"contentType\":\"image/webp\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.imageKey",
						startsWith("profile-images/" + userId + "/")))
				.andExpect(jsonPath("$.imageKey", endsWith(".webp")))
				.andExpect(jsonPath("$.uploadUrl").isNotEmpty());
	}

	@Test
	@DisplayName("등록하면 200이고 profileImageUrl이 채워져 다음 조회에도 남는다")
	void 등록_후_조회() throws Exception {
		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.profileImageUrl").doesNotExist());

		mockMvc.perform(put("/api/v1/users/me/profile-image")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"imageKey\":\"profile-images/" + userId + "/test.webp\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.profileImageUrl").isNotEmpty());

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.profileImageUrl").isNotEmpty());
	}

	@Test
	@DisplayName("허용 목록 밖 contentType은 400 USER_INVALID_IMAGE_CONTENT_TYPE")
	void 지원하지_않는_형식_400() throws Exception {
		mockMvc.perform(post("/api/v1/users/me/profile-image/upload-url")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"contentType\":\"application/pdf\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("USER_INVALID_IMAGE_CONTENT_TYPE"));
	}

	@Test
	@DisplayName("남의 key를 등록하려 하면 400 — key가 그대로 presigned GET URL의 입력이다")
	void 남의_key_400() throws Exception {
		mockMvc.perform(put("/api/v1/users/me/profile-image")
						.header(HttpHeaders.AUTHORIZATION, bearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"imageKey\":\"profile-images/999999.webp\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("USER_INVALID_PROFILE_IMAGE_KEY"));

		mockMvc.perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(jsonPath("$.profileImageUrl").doesNotExist());
	}

	@Test
	@DisplayName("프로필 이미지 presign은 로그인이 필요하다 — 토큰 없이 부르면 401")
	void 비로그인_401() throws Exception {
		mockMvc.perform(post("/api/v1/users/me/profile-image/upload-url")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"contentType\":\"image/webp\"}"))
				.andExpect(status().isUnauthorized());
	}
}
