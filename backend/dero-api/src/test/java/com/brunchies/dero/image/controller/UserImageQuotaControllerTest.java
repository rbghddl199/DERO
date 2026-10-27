package com.brunchies.dero.image.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.image.GeneratedImage;
import com.brunchies.dero.placement.TimeOfDay;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * {@code GET /users/me/image-quota}(REQ-IMG-03)를 <b>HTTP + 진짜 Postgres</b>로 검증한다.
 *
 * <p><b>여기서만 볼 수 있는 것</b>: 카운트 근거가 {@code generated_image} 행 수라는 사실과, 그 행이
 * 다른 사용자 것이면 안 세어진다는 것. 429 자체는 게이트 쪽 테스트가 본다
 * ({@code PlacementFeedEntryControllerTest.한도_초과_429}) — <b>같은 상한을 두 곳이 보므로 두
 * 테스트가 한 세트다.</b>
 */
@AutoConfigureMockMvc
class UserImageQuotaControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private GeneratedImageRepository generatedImages;

	/** Boot 4는 {@code tools.jackson}으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	private User me;
	private String bearer;

	@BeforeEach
	void setUp() {
		me = users.save(User.create("quota@example.com", Provider.KAKAO, "provider-quota", "한도주인"));
		bearer = "Bearer " + jwtIssuer.issueAccessToken(me.getId(), UserRole.USER);
	}

	private JsonNode quota() throws Exception {
		MvcResult result = mockMvc.perform(
						get("/api/v1/users/me/image-quota").header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(status().isOk())
				.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	@Test
	@DisplayName("한 장도 안 뽑았으면 usedToday가 0이고 상한은 application.yaml의 7이다")
	void 초기_상태() throws Exception {
		JsonNode body = quota();

		assertThat(body.get("usedToday").asLong()).isZero();
		assertThat(body.get("dailyLimit").asInt()).isEqualTo(7);
	}

	@Test
	@DisplayName("리셋 시각은 다음 날 자정이고 오프셋을 포함한 ISO-8601이다")
	void 리셋_시각() throws Exception {
		OffsetDateTime expected = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS).plusDays(1);

		String resetAt = quota().get("resetAt").asText();

		assertThat(OffsetDateTime.parse(resetAt)).isEqualTo(expected);
		// 오프셋이 붙어 있어야 클라이언트 타임존에서 안 어긋난다 — 'Z'나 '+09:00'로 끝난다.
		assertThat(resetAt).matches(".*(Z|[+-]\\d{2}:\\d{2})$");
	}

	@Test
	@DisplayName("오늘 만든 generated_image 행 수가 곧 usedToday다 — 남의 행은 안 센다")
	void 행_수가_카운트다() throws Exception {
		User other = users.save(
				User.create("other-quota@example.com", Provider.GOOGLE, "provider-oq", "남"));
		generatedImages.saveAll(List.of(
				GeneratedImage.create(me, null, "generated/a.png", TimeOfDay.DAY),
				GeneratedImage.create(me, null, "generated/b.png", TimeOfDay.NIGHT),
				GeneratedImage.create(me, null, "generated/c.png", TimeOfDay.DAY),
				GeneratedImage.create(other, null, "generated/d.png", TimeOfDay.DAY)));

		assertThat(quota().get("usedToday").asLong()).isEqualTo(3);
	}

	@Test
	@DisplayName("이미지 한도 조회는 로그인이 필요하다 — 토큰 없이 부르면 401")
	void 비로그인_401() throws Exception {
		mockMvc.perform(get("/api/v1/users/me/image-quota")).andExpect(status().isUnauthorized());
	}
}
