package com.brunchies.dero.image.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import com.brunchies.dero.image.GeneratedImage;
import com.brunchies.dero.placement.TimeOfDay;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 게이트와 큐 투입(DERO-340)을 <b>HTTP 시임</b>으로 검증한다 — 컨트롤러 → 서비스 →
 * 진짜 Postgres + 진짜 Redis 한 방이라 프론트가 보는 것과 같은 것을 본다.
 *
 * <p><b>테스트 트랜잭션을 끈다</b>({@code NOT_SUPPORTED}). 큐 투입이 {@code afterCommit}에 걸려
 * 있어서, 요청이 테스트 트랜잭션에 참여하면 <b>커밋이 없어 큐에 아무것도 안 들어간다</b> —
 * 정상 경로 단언이 통째로 거짓이 된다. 격리는 {@link #tearDown}의 truncate가 맡는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementFeedEntryControllerTest extends AbstractRedisIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	/** Boot 4는 {@code tools.jackson}으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

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
	private GeneratedImageRepository generatedImages;

	@Autowired
	private ImagePublishQueue queue;

	@Autowired
	private StringRedisTemplate redis;

	@Autowired
	private JdbcTemplate jdbc;

	private User owner;
	private Long strangerId;
	private Long deskTextureId;
	private Long propProductId;
	private Long oversizedPropId;

	@BeforeEach
	void setUp() {
		owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		strangerId =
				users.save(User.create("other@example.com", Provider.KAKAO, "p-other", "남")).getId();

		Category category = categories.save(Category.createRoot("데스크", null, 1));
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskTextureId = texture.getId();

		propProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"스피커", null, 89_000, null, 120, 120, 200, 2_000, false, MountSurface.TOP)).getId();
		// 상판(1400×700)보다 넓다 — 판정 ③이 INCOMPATIBLE을 낸다.
		oversizedPropId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"3미터 선반", null, 500_000, null, 3_000, 400, 300, 20_000, false, MountSurface.TOP))
				.getId();

		clearQueue();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, product,
					desk_texture, category, hashtag, "user" RESTART IDENTITY CASCADE
				""");
		clearQueue();
	}

	// --- ① 판정 게이트 ---

	@Test
	@DisplayName("규격 위반이 있으면 업로드는 422이고 큐에 아무것도 안 들어간다")
	void 위반_배치는_422이고_큐_미투입() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", oversizedPropId)));
		long before = queue.pendingSize();

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PLACEMENT_JUDGMENT_FAILED"));

		assertThat(queue.pendingSize()).isEqualTo(before);
		assertThat(publishStatusOf(placementId)).isEqualTo("PRIVATE");
	}

	// --- ② 스크린샷 ---

	@Test
	@DisplayName("스크린샷이 없으면 업로드는 422이고 큐에 안 들어간다")
	void 스크린샷_없으면_422() throws Exception {
		long placementId = save(snapshot(List.of(item("p1", propProductId)))).get("id").asLong();

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PLACEMENT_THUMBNAIL_REQUIRED"));

		assertThat(queue.pendingSize()).isZero();
	}

	// --- ③ 한도 ---

	@Test
	@DisplayName("일일 한도를 다 쓰면 업로드는 429 IMAGE_QUOTA_EXCEEDED다")
	void 한도_초과_429() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		// 기본 상한이 21장이다(application.yaml). 딱 채우면 이번 3장이 상한을 넘는다.
		List<GeneratedImage> used = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			used.add(GeneratedImage.create(owner, null, "generated/%d.png".formatted(i), TimeOfDay.DAY));
		}
		generatedImages.saveAll(used);

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("IMAGE_QUOTA_EXCEEDED"));

		assertThat(queue.pendingSize()).isZero();
	}

	// --- ④ 정상 경로 ---

	@Test
	@DisplayName("게이트를 통과하면 202이고 publishStatus가 PENDING, 큐에 1건이 쌓인다")
	void 업로드_202_그리고_큐_투입() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isAccepted());

		assertThat(publishStatusOf(placementId)).isEqualTo("PENDING");
		assertThat(queue.pendingSize()).isEqualTo(1);
	}

	@Test
	@DisplayName("PENDING에 다시 업로드해도 202이고 다시 투입된다 — 큐 유실로 갇힌 배치를 푸는 유일한 길")
	void 대기중_재업로드는_다시_투입한다() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		for (int i = 0; i < 2; i++) {
			mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
							.header("Authorization", bearer(owner.getId())))
					.andExpect(status().isAccepted());
		}

		// 요청 쪽에서 막지 않는다 — afterCommit 직후 Redis가 끊기면 DB만 PENDING이고 큐는 비어 있어서,
		// 여기서 막으면 그 배치는 어떤 사용자 동작으로도 풀 수 없다. 중복은 소비 쪽 가드가 흡수한다.
		assertThat(queue.pendingSize()).isEqualTo(2);
		assertThat(publishStatusOf(placementId)).isEqualTo("PENDING");
	}

	@Test
	@DisplayName("한도를 다 썼어도 이미 PENDING인 배치의 재투입은 429가 아니다")
	void 대기중_재투입은_한도를_다시_묻지_않는다() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isAccepted());

		List<GeneratedImage> used = new ArrayList<>();
		for (int i = 0; i < 21; i++) {
			used.add(GeneratedImage.create(owner, null, "generated/%d.png".formatted(i), TimeOfDay.DAY));
		}
		generatedImages.saveAll(used);

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isAccepted());
	}

	// --- 소유자 ---

	@Test
	@DisplayName("남의 배치를 업로드하려 하면 404다 — 존재 여부를 흘리지 않는다")
	void 남의_배치_업로드_404() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PLACEMENT_NOT_FOUND"));

		assertThat(queue.pendingSize()).isZero();
	}

	@Test
	@DisplayName("남의 배치 공개를 취소하려 하면 404다")
	void 남의_배치_취소_404() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(delete("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound());
	}

	// --- 공개 취소 ---

	@Test
	@DisplayName("공개 취소는 204이고 배치가 PRIVATE으로 내려가 피드에서 사라진다")
	void 공개_취소_204() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isAccepted());
		// 워커 없이도 취소는 성립해야 한다 — 대기 중 취소가 정상 경로다.
		jdbc.update("update placement set publish_status = 'PUBLIC' where id = ?", placementId);

		mockMvc.perform(delete("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isNoContent());

		assertThat(publishStatusOf(placementId)).isEqualTo("PRIVATE");
		// 비로그인에게는 이제 안 보인다 — 피드에서 사라졌다는 뜻이다.
		mockMvc.perform(get("/api/v1/placements/{id}", placementId))
				.andExpect(status().isNotFound());
	}

	// --- 태그 ---

	@Test
	@DisplayName("공개 전환 본문의 태그가 배치에 붙는다 — '#'은 붙이지 않는다")
	void 공개_전환_태그() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[\"원목데스크\",\"미니멀\"]}"))
				.andExpect(status().isAccepted());

		assertThat(tagsOf(placementId)).containsExactlyInAnyOrder("원목데스크", "미니멀");
	}

	@Test
	@DisplayName("태그 교체는 204이고 게시 상태·큐를 건드리지 않는다 — 상상도를 다시 만들지 않는다")
	void 태그_교체_204() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[\"원목데스크\"]}"))
				.andExpect(status().isAccepted());
		jdbc.update("update placement set publish_status = 'PUBLIC' where id = ?", placementId);
		clearQueue();

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry/tags", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[\"게이밍\"]}"))
				.andExpect(status().isNoContent());

		assertThat(tagsOf(placementId)).containsExactly("게이밍");
		// 공개 전환을 다시 태우면 PUBLIC이 PENDING으로 되돌아가고 한도까지 깎인다 — 그래서 별도 자리다.
		assertThat(publishStatusOf(placementId)).isEqualTo("PUBLIC");
		assertThat(queue.pendingSize()).isZero();
	}

	@Test
	@DisplayName("태그 교체 본문의 빈 배열은 전부 제거다")
	void 태그_교체_빈_배열은_전부_제거() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[\"원목데스크\"]}"))
				.andExpect(status().isAccepted());

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry/tags", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[]}"))
				.andExpect(status().isNoContent());

		assertThat(tagsOf(placementId)).isEmpty();
	}

	@Test
	@DisplayName("태그 교체 본문의 tags가 없으면 400이다 — 여기선 '미변경'이 뜻을 갖지 않는다")
	void 태그_교체_본문_없으면_400() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry/tags", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{}"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@DisplayName("남의 배치 태그를 교체하려 하면 404다")
	void 남의_배치_태그_교체_404() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry/tags", placementId)
						.header("Authorization", bearer(strangerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"tags\":[\"게이밍\"]}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PLACEMENT_NOT_FOUND"));
	}

	// --- 재시도 ---

	@Test
	@DisplayName("FAILED 상태에 같은 PUT을 다시 부르면 재투입된다 — 별도 재시도 엔드포인트가 없다")
	void 실패_후_재업로드() throws Exception {
		long placementId = savedPlacementWithThumbnail(List.of(item("p1", propProductId)));
		jdbc.update("update placement set publish_status = 'FAILED' where id = ?", placementId);
		clearQueue();

		mockMvc.perform(put("/api/v1/placements/{id}/feed-entry", placementId)
						.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isAccepted());

		assertThat(publishStatusOf(placementId)).isEqualTo("PENDING");
		assertThat(queue.pendingSize()).isEqualTo(1);
	}

	// --- 도우미 ---

	private long savedPlacementWithThumbnail(List<Map<String, Object>> items) throws Exception {
		long placementId = save(snapshot(items)).get("id").asLong();
		MvcResult presigned = mockMvc.perform(
						post("/api/v1/placements/{id}/thumbnail/upload-url", placementId)
								.header("Authorization", bearer(owner.getId())))
				.andExpect(status().isOk())
				.andReturn();
		String thumbnailKey = read(presigned).get("thumbnailKey").asText();
		mockMvc.perform(put("/api/v1/placements/{id}/thumbnail", placementId)
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(Map.of("thumbnailKey", thumbnailKey))))
				.andExpect(status().isNoContent());
		return placementId;
	}

	private JsonNode save(Map<String, Object> body) throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(owner.getId()))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result);
	}

	private String publishStatusOf(long placementId) {
		return jdbc.queryForObject(
				"select publish_status from placement where id = ?", String.class, placementId);
	}

	private List<String> tagsOf(long placementId) {
		return jdbc.queryForList("""
				select h.name from placement_hashtag ph join hashtag h on h.id = ph.hashtag_id
				where ph.placement_id = ?
				""", String.class, placementId);
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

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}

	private Map<String, Object> snapshot(List<Map<String, Object>> items) {
		Map<String, Object> body = new HashMap<>();
		body.put("title", "업로드 대상");
		body.put("description", null);
		body.put("version", null);
		body.put("isRoomLightOn", true);
		body.put("budgetKrw", 1_500_000);
		body.put("desk", customDesk());
		body.put("items", items);
		return body;
	}

	private Map<String, Object> customDesk() {
		Map<String, Object> desk = new HashMap<>();
		desk.put("specSource", "CUSTOM");
		desk.put("productId", null);
		desk.put("widthMm", 1400);
		desk.put("depthMm", 700);
		desk.put("heightMm", 720);
		desk.put("topThicknessMm", 25);
		desk.put("edgeThicknessMm", null);
		desk.put("deskTextureId", deskTextureId);
		desk.put("frameType", "T_FRAME");
		return desk;
	}

	private Map<String, Object> item(String ref, Long productId) {
		Map<String, Object> item = new HashMap<>();
		item.put("ref", ref);
		item.put("id", null);
		item.put("productId", productId);
		item.put("positionXMm", -200);
		item.put("positionYMm", 720);
		item.put("positionZMm", -150);
		item.put("rotationDeg", 0.0);
		item.put("surfaceType", "TOP");
		item.put("wallSide", null);
		item.put("mountedToRef", null);
		item.put("jointValues", null);
		item.put("emitterColor", null);
		return item;
	}
}
