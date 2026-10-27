package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
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
 * {@code POST}/{@code GET /placements/{id}/remixes} — 상태 코드·가시성·출처 표시를 HTTP 시임으로
 * 검증한다. 복사 결과의 SQL 수준 성질(결합 재매핑·전체 복사)은
 * {@code PlacementRemixPersistenceTest}가 본다.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PlacementListControllerTest}와 같다 — MockMvc 요청이 테스트
 * 트랜잭션에 참여하면 실패 경로가 rollback-only를 만들어 뒤의 검증이 통째로 죽는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementRemixControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	/** Boot 4는 Jackson 3으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다 — 직접 만든다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private JdbcTemplate jdbc;

	private Long authorId;
	private Long remixerId;

	@BeforeEach
	void setUp() {
		authorId = users.save(User.create("author@example.com", Provider.KAKAO, "p-a", "원작자"))
				.getId();
		remixerId = users.save(User.create("remixer@example.com", Provider.KAKAO, "p-r", "리믹서"))
				.getId();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE placed_item, placement_desk, placement, "user" RESTART IDENTITY CASCADE
				""");
	}

	@Test
	@DisplayName("공개 배치 리믹스는 201 + Location이고 새 배치는 호출자 소유 비공개다")
	void 리믹스_생성() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);

		MvcResult result = mockMvc.perform(post("/api/v1/placements/{id}/remixes", sourceId)
						.header("Authorization", bearer(remixerId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.publishStatus").value("PRIVATE"))
				.andExpect(jsonPath("$.sourcePlacement.id").value(sourceId))
				.andExpect(jsonPath("$.sourcePlacement.available").value(true))
				.andExpect(jsonPath("$.sourcePlacement.ownerNickname").value("원작자"))
				.andReturn();

		long newId = read(result).get("id").asLong();
		assertThat(newId).isNotEqualTo(sourceId);
		assertThat(result.getResponse().getHeader("Location"))
				.isEqualTo("/api/v1/placements/" + newId);

		// 새 배치는 리믹서의 작업실에만 있다 — 비로그인 피드엔 안 뜬다(PRIVATE).
		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements").param("owner", "me")
						.header("Authorization", bearer(remixerId)))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(newId);
	}

	@Test
	@DisplayName("비공개 원본 리믹스는 404다 — 남의 것도 내 것도 같은 답이다")
	void 비공개_원본은_404() throws Exception {
		long othersPrivate = seed(authorId, "남의 비공개", PublishStatus.PRIVATE);
		long myPrivate = seed(remixerId, "내 비공개", PublishStatus.PRIVATE);

		mockMvc.perform(post("/api/v1/placements/{id}/remixes", othersPrivate)
						.header("Authorization", bearer(remixerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PLACEMENT_NOT_FOUND"));
		mockMvc.perform(post("/api/v1/placements/{id}/remixes", myPrivate)
						.header("Authorization", bearer(remixerId)))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("비로그인 리믹스 생성은 401이다")
	void 비로그인_생성은_401() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);

		mockMvc.perform(post("/api/v1/placements/{id}/remixes", sourceId))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("리믹스 목록은 비로그인에게도 200이고 남의 비공개 리믹스는 안 보인다")
	void 목록_가시성() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);
		long publicRemix = remix(remixerId, sourceId);
		long privateRemix = remix(authorId, sourceId);
		jdbc.update("update placement set publish_status = 'PUBLIC' where id = ?", publicRemix);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements/{id}/remixes", sourceId))
				.andExpect(status().isOk())
				.andReturn()))
				.containsExactly(publicRemix)
				.doesNotContain(privateRemix);

		// 자기 비공개 리믹스는 본인에게만 보인다.
		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements/{id}/remixes", sourceId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andReturn()))
				.containsExactlyInAnyOrder(publicRemix, privateRemix);
	}

	@Test
	@DisplayName("리믹스 목록에 리믹스가 아닌 배치는 안 섞인다")
	void 목록은_출처로만_걸린다() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);
		seed(authorId, "무관한 공개 배치", PublishStatus.PUBLIC);
		long remixId = remix(remixerId, sourceId);
		jdbc.update("update placement set publish_status = 'PUBLIC' where id = ?", remixId);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements/{id}/remixes", sourceId))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(remixId);
	}

	@Test
	@DisplayName("안 보이는 배치의 리믹스 목록은 404다 — 리믹스 건수도 흘리지 않는다")
	void 안_보이는_원본의_목록은_404() throws Exception {
		long othersPrivate = seed(authorId, "남의 비공개", PublishStatus.PRIVATE);

		mockMvc.perform(get("/api/v1/placements/{id}/remixes", othersPrivate))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("원본이 지워지면 상세의 출처가 '원본 없음'이 되고 리믹스는 살아 있다")
	void 원본_삭제() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);
		long remixId = remix(remixerId, sourceId);

		jdbc.update("update placement set deleted_at = now() where id = ?", sourceId);

		mockMvc.perform(get("/api/v1/placements/{id}", remixId)
						.header("Authorization", bearer(remixerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sourcePlacement.available").value(false))
				.andExpect(jsonPath("$.sourcePlacement.id").value(sourceId))
				.andExpect(jsonPath("$.sourcePlacement.title").doesNotExist());
	}

	@Test
	@DisplayName("리믹스가 아닌 배치의 상세엔 sourcePlacement가 없다")
	void 원본_배치는_출처가_없다() throws Exception {
		long sourceId = seed(authorId, "원본", PublishStatus.PUBLIC);

		mockMvc.perform(get("/api/v1/placements/{id}", sourceId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sourcePlacement").doesNotExist());
	}

	private long seed(Long userId, String title, PublishStatus publishStatus) {
		Placement placement =
				placements.save(Placement.create(users.getReferenceById(userId), title, null, null));
		jdbc.update("update placement set publish_status = ? where id = ?", publishStatus.name(),
				placement.getId());
		return placement.getId();
	}

	private long remix(Long userId, long sourceId) throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/placements/{id}/remixes", sourceId)
						.header("Authorization", bearer(userId)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	private List<Long> idsOf(MvcResult result) throws Exception {
		List<Long> ids = new ArrayList<>();
		for (JsonNode row : read(result).get("content")) {
			ids.add(row.get("id").asLong());
		}
		return ids;
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
