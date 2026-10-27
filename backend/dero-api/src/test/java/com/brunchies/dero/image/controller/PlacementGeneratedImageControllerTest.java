package com.brunchies.dero.image.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.image.service.GeneratedImageService;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 상세의 상상도 조회(DERO-341).
 *
 * <p>큐를 안 만지므로 Redis 없이 Postgres 베이스만 상속한다 — 소비 결과를 서비스로 직접 만들고
 * 그 결과가 HTTP로 어떻게 나가는지만 본다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementGeneratedImageControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private GeneratedImageService generatedImageService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private JdbcTemplate jdbc;

	private final ObjectMapper objectMapper = new ObjectMapper();

	private Long placementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		Placement placement = Placement.create(owner, "업로드 대상", null, null);
		placement.registerThumbnail("placement-thumbnails/stub.png");
		placement.requestFeedEntry();
		placementId = placements.save(placement).getId();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, "user"
					RESTART IDENTITY CASCADE
				""");
	}

	@Test
	@DisplayName("공개된 배치의 상상도는 presigned URL로 나가고 대표가 정확히 1장이다")
	void 상상도_조회() throws Exception {
		generatedImageService.publish(placementId);

		MvcResult result =
				mockMvc.perform(get("/api/v1/placements/{id}/generated-images", placementId))
						.andExpect(status().isOk())
						.andExpect(jsonPath("$.length()").value(1))
						.andReturn();

		JsonNode images = objectMapper.readTree(result.getResponse().getContentAsString());
		long primaries = 0;
		for (JsonNode image : images) {
			assertThat(image.get("url").asText()).isNotBlank();
			assertThat(image.get("timeOfDay").asText()).isEqualTo("DAY");
			if (image.get("isPrimary").asBoolean()) {
				primaries++;
			}
		}
		assertThat(primaries).isEqualTo(1);
	}

	@Test
	@DisplayName("아직 공개되지 않은 배치의 상상도는 비로그인에게 404다 — 가시성은 배치를 따른다")
	void 비공개_배치_상상도_404() throws Exception {
		mockMvc.perform(get("/api/v1/placements/{id}/generated-images", placementId))
				.andExpect(status().isNotFound());
	}
}
