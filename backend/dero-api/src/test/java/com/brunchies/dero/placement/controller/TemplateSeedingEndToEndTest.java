package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractRedisIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 템플릿 시딩 전 구간을 <b>HTTP로만</b> 통과시킨다(DERO-347) — 저장 → 썸네일 등록 → 업로드
 * 게이트 → Redis 큐 → 스텁 워커 → {@code PUBLIC} → 템플릿 지정 → 비로그인 피드에 카드 3장.
 *
 * <p><b>SQL로 상태를 밀어 넣지 않는 것이 이 테스트의 존재 이유다.</b> 340은 큐 투입까지, 341은
 * 큐에 직접 넣은 작업의 소비까지만 본다 — 그 둘 사이의 이음매(요청이 실제로 워커가 집는 큐에
 * 들어가는가)는 어느 쪽도 지나가지 않아서, 배포 게재가 그 자리에서 조용히 멈출 수 있었다.
 *
 * <p><b>배치 3벌은 서로 다른 책상·제품이다</b> — 같은 조합 3벌이면 피드가 같은 그림 3장이 된다는
 * 티켓 요구를 여기서도 지킨다. 진짜 그림은 스텁이 스크린샷 key를 재사용하므로 결국 배치별로 갈리고,
 * 그 갈림의 근거가 배치마다 다른 책상 크기와 올려 둔 제품이다.
 *
 * <p><b>테스트 트랜잭션을 끈다</b>({@code NOT_SUPPORTED}) — 큐 투입이 {@code afterCommit}이라
 * 요청이 테스트 트랜잭션에 참여하면 커밋이 없어 큐에 아무것도 안 들어간다
 * ({@code PlacementFeedEntryControllerTest}와 같은 판단). 격리는 {@link #tearDown}의 truncate다.
 */
@SpringBootTest(properties = "app.image.worker.enabled=true")
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class TemplateSeedingEndToEndTest extends AbstractRedisIntegrationTest {

	/**
	 * 업로드 1회가 쓰는 상상도 장 수(ADR-0015 결정 6, 2026-08-06 3→1 개정). {@code IMAGES_PER_UPLOAD}를
	 * 그대로 읽지 않고 여기 적어 둔다 — 프로덕션 상수를 참조하면 상수를 잘못 바꿔도 테스트가 같이
	 * 따라가서 아무것도 못 잡는다.
	 */
	private static final int GENERATED_IMAGE_COUNT = 1;

	/** 게재할 운영진 배치 수 — 빈 피드를 막는 최소치다(티켓 14). */
	private static final int SEED_COUNT = 3;

	/** Boot 4는 {@code tools.jackson}으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private DeskTextureRepository deskTextures;

	@Autowired
	private ProductRepository products;

	@Autowired
	private StringRedisTemplate redis;

	@Autowired
	private JdbcTemplate jdbc;

	private Long adminUserId;
	private Long deskTextureId;
	private List<Long> productIds;

	@BeforeEach
	void setUp() {
		User admin = users.save(User.create("ops@example.com", Provider.KAKAO, "p-ops", "운영진"));
		adminUserId = admin.getId();

		Category category = categories.save(Category.createRoot("데스크", null, 1));
		deskTextureId = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1)).getId();

		productIds = List.of(
				savedProp(category, "스피커", 120, 120, 200),
				savedProp(category, "스탠드 조명", 180, 180, 420),
				savedProp(category, "책 스탠드", 200, 140, 160));

		clearQueue();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, product,
					desk_texture, category, "user" RESTART IDENTITY CASCADE
				""");
		clearQueue();
	}

	@Test
	@DisplayName("운영진 배치 3벌이 업로드→큐→워커를 실제로 통과해 PUBLIC이 되고 템플릿으로 지정된다")
	void 시딩_전_구간() throws Exception {
		List<Long> seeded = List.of(seed(0), seed(1), seed(2));
		assertThat(seeded).hasSize(SEED_COUNT).doesNotHaveDuplicates();

		for (Long placementId : seeded) {
			// 워커는 별도 스레드라 커밋 뒤 언제 집을지 모른다 — 폴링으로 기다린다.
			await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofMillis(200))
					.untilAsserted(() -> {
						assertThat(publishStatusOf(placementId)).isEqualTo("PUBLIC");
						assertThat(generatedImageCountOf(placementId)).isEqualTo(GENERATED_IMAGE_COUNT);
						assertThat(primaryImageCountOf(placementId)).isEqualTo(1);
					});

			mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId)
							.header("Authorization", adminBearer()))
					.andExpect(status().isNoContent());
		}

		// 비로그인 피드 — 카드 3장이 보이고 전부 템플릿이다(빈 상태 화면이 뜨지 않는다).
		mockMvc.perform(get("/api/v1/placements").param("publishStatus", "PUBLIC"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content", hasSize(SEED_COUNT)))
				.andExpect(jsonPath("$.content[0].isTemplate").value(true))
				.andExpect(jsonPath("$.content[1].isTemplate").value(true))
				.andExpect(jsonPath("$.content[2].isTemplate").value(true));

		// 각 카드에 그림이 있다 — 상세의 상상도가 비로그인에게도 나간다.
		for (Long placementId : seeded) {
			mockMvc.perform(get("/api/v1/placements/{id}/generated-images", placementId))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$", hasSize(GENERATED_IMAGE_COUNT)));
		}
	}

	/** 저장 → 썸네일 2단계 등록 → 업로드(202)까지. 배치마다 책상 크기·제품이 다르다. */
	private Long seed(int index) throws Exception {
		long placementId = save(snapshot(index)).get("id").asLong();

		MvcResult presigned = mockMvc.perform(
						post("/api/v1/placements/{id}/thumbnail/upload-url", placementId)
								.header("Authorization", userBearer()))
				.andExpect(status().isOk())
				.andReturn();
		mockMvc.perform(put("/api/v1/placements/{id}/thumbnail", placementId)
						.header("Authorization", userBearer())
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(Map.of("thumbnailKey",
								read(presigned).get("thumbnailKey").asText()))))
				.andExpect(status().isNoContent());

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", userBearer()))
				.andExpect(status().isAccepted());

		return placementId;
	}

	private JsonNode save(Map<String, Object> body) throws Exception {
		return read(mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", userBearer())
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isCreated())
				.andReturn());
	}

	private Long savedProp(Category category, String name, int widthMm, int depthMm, int heightMm) {
		return products.save(Prop.create(ProductSource.CATALOG, null, null, category, name, null,
				89_000, null, widthMm, depthMm, heightMm, 2_000, false, MountSurface.TOP)).getId();
	}

	private Map<String, Object> snapshot(int index) {
		Map<String, Object> desk = new HashMap<>();
		desk.put("specSource", "CUSTOM");
		desk.put("productId", null);
		// 배치마다 다른 상판이라 피드가 같은 그림 3장으로 보이지 않는다.
		desk.put("widthMm", 1_200 + index * 200);
		desk.put("depthMm", 600 + index * 50);
		desk.put("heightMm", 720);
		desk.put("topThicknessMm", 25);
		desk.put("edgeThicknessMm", null);
		desk.put("deskTextureId", deskTextureId);
		desk.put("frameType", "T_FRAME");

		Map<String, Object> item = new HashMap<>();
		item.put("ref", "p1");
		item.put("id", null);
		item.put("productId", productIds.get(index));
		item.put("positionXMm", -200);
		item.put("positionYMm", 720);
		item.put("positionZMm", -150);
		item.put("rotationDeg", 0.0);
		item.put("surfaceType", "TOP");
		item.put("wallSide", null);
		item.put("mountedToRef", null);
		item.put("jointValues", null);
		item.put("emitterColor", null);

		Map<String, Object> body = new HashMap<>();
		body.put("title", "운영진 시드 " + (index + 1));
		body.put("description", null);
		body.put("version", null);
		body.put("isRoomLightOn", true);
		body.put("budgetKrw", 1_500_000);
		body.put("desk", desk);
		body.put("items", List.of(item));
		return body;
	}

	private String publishStatusOf(long placementId) {
		return jdbc.queryForObject(
				"select publish_status from placement where id = ?", String.class, placementId);
	}

	private Integer generatedImageCountOf(long placementId) {
		return jdbc.queryForObject(
				"select count(*) from generated_image where placement_id = ?", Integer.class,
				placementId);
	}

	private Integer primaryImageCountOf(long placementId) {
		return jdbc.queryForObject(
				"select count(*) from generated_image where placement_id = ? and is_primary",
				Integer.class, placementId);
	}

	private void clearQueue() {
		redis.delete(List.of(
				"image:publish:pending", "image:publish:processing", "image:publish:claimed-at"));
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String json(Object body) throws Exception {
		return objectMapper.writeValueAsString(body);
	}

	/** 배치를 만드는 것은 운영진의 <b>사용자</b> 행위다 — 저장·업로드 경로엔 관리자 권한이 없다. */
	private String userBearer() {
		return "Bearer " + jwtIssuer.issueAccessToken(adminUserId, UserRole.USER);
	}

	private String adminBearer() {
		return "Bearer " + jwtIssuer.issueAccessToken(adminUserId, UserRole.ADMIN);
	}
}
