package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 저장·상세·삭제·썸네일을 <b>HTTP 시임</b>으로 검증한다 — 컨트롤러 → 서비스 → 리포지토리 →
 * 진짜 Postgres 한 방이라 프론트가 보는 것과 같은 것을 본다.
 *
 * <p><b>테스트 트랜잭션을 끈다</b>({@code NOT_SUPPORTED}). 베이스의 {@code @Transactional}을 그대로
 * 두면 MockMvc 요청 핸들러가 테스트 트랜잭션에 참여하는데, 실패 경로 테스트에서 서비스가 던진 예외가
 * <b>공유 트랜잭션을 rollback-only로 만들어</b> 그 뒤의 검증 조회가 통째로 죽는다. 특히 409 뒤 "DB가
 * 안 바뀌었나"는 앞선 저장이 실제로 <b>커밋</b>돼 있어야만 의미가 있는 단언이다. 대신 격리는
 * {@link #tearDown}의 truncate가 맡는다({@code backend/CLAUDE.md}의 e2e 격리 규약과 같다).
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	/**
	 * 컨테이너에서 주입받지 않는다 — Boot 4는 {@code tools.jackson}(Jackson 3)으로 옮겨 가서
	 * {@code com.fasterxml...ObjectMapper} 빈이 없다. 여기서는 요청 본문을 만들고 응답을 트리로 읽는
	 * 용도뿐이라 서버 설정과 같은 인스턴스일 필요가 없다.
	 */
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
	private JdbcTemplate jdbc;

	private Long ownerId;
	private Long strangerId;
	private Long deskTextureId;
	private Long deskProductId;
	private Long armProductId;
	private Long monitorProductId;
	private Long oversizedPropProductId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인")).getId();
		strangerId =
				users.save(User.create("other@example.com", Provider.KAKAO, "p-other", "남")).getId();

		Category category = categories.save(Category.createRoot("데스크", null, 1));
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskTextureId = texture.getId();

		deskProductId = products.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1600 책상", null, 300_000, null, 1600, 800, 730, 18, 40, false, texture,
				FrameType.FOUR_LEG, null)).getId();
		armProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"모니터암", null, 89_000, null, 120, 480, 500, 4_000, false, MountSurface.TOP)).getId();
		monitorProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"27인치 모니터", null, 350_000, null, 610, 200, 400, 5_500, false, MountSurface.TOP))
				.getId();
		// 어떤 책상 상판보다도 큰 소품 — 판정 ③(PROP_DESK)이 반드시 INCOMPATIBLE을 낸다.
		oversizedPropProductId = products.save(Prop.create(ProductSource.CATALOG, null, null,
				category, "초대형 선반", null, 50_000, null, 2_400, 1_200, 300, 9_000, false,
				MountSurface.TOP)).getId();
	}

	/** 테스트 트랜잭션이 없어 각 요청이 커밋된다 — 다음 테스트에 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE placed_item, placement_wall, placement_desk, placement, product,
					desk_texture, category, "user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 저장 ---

	@Test
	@DisplayName("신규 저장은 201 + Location이고 응답에 ref → id 매핑이 실린다")
	void 신규_저장() throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("듀얼 모니터 셋업", null, List.of(
								item("p1", null, armProductId, null),
								item("p2", null, monitorProductId, "p1"))))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.version").value(0))
				.andExpect(jsonPath("$.items.length()").value(2))
				.andExpect(jsonPath("$.items[0].ref").value("p1"))
				.andExpect(jsonPath("$.items[1].ref").value("p2"))
				.andExpect(jsonPath("$.violations").isArray())
				.andReturn();

		JsonNode body = read(result);
		long placementId = body.get("id").asLong();
		assertThat(result.getResponse().getHeader("Location"))
				.isEqualTo("/api/v1/placements/" + placementId);
		// id의 부호는 보지 않는다 — 시퀀스 pooled optimizer가 첫 블록에서 음수 id를 내준다
		// (INCREMENT BY 50인 시퀀스의 첫 nextval이 1이라 -48..1 구간이 배정된다). 스키마 전역 성질이다.
		assertThat(body.get("items").get(0).get("id").asLong())
				.isNotEqualTo(body.get("items").get(1).get("id").asLong());
	}

	@Test
	@DisplayName("mountedToRef로 표현한 결합이 저장 후 실제 아이템 id 관계로 남는다")
	void 결합_참조_해석() throws Exception {
		JsonNode saved = save(ownerId, snapshot("결합", null, List.of(
				item("p1", null, armProductId, null),
				item("p2", null, monitorProductId, "p1"))));
		long armId = saved.get("items").get(0).get("id").asLong();
		long monitorId = saved.get("items").get(1).get("id").asLong();

		MvcResult detail = mockMvc.perform(get("/api/v1/placements/{id}", saved.get("id").asLong())
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn();

		JsonNode arm = itemById(read(detail), armId);
		JsonNode monitor = itemById(read(detail), monitorId);
		assertThat(arm.get("isVesaMounted").asBoolean()).isFalse();
		assertThat(arm.get("mountedToItemId").isNull()).isTrue();
		assertThat(monitor.get("isVesaMounted").asBoolean()).isTrue();
		assertThat(monitor.get("mountedToItemId").asLong()).isEqualTo(armId);
	}

	@Test
	@DisplayName("규격 위반이 있는 스냅샷도 저장은 성공한다 — 저장을 막지 않는다(ADR-0009 결정 5)")
	void 위반_스냅샷도_저장된다() throws Exception {
		// 상판 밖으로 한참 나간 좌표. 게이트는 공개에 걸려 있으므로 저장은 통과해야 한다.
		Map<String, Object> outside = item("p1", null, armProductId, null);
		outside.put("positionXMm", 999_000);
		outside.put("positionZMm", 999_000);

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("위반", null, List.of(outside)))))
				.andExpect(status().isCreated());
	}

	// --- 낙관적 잠금 ---

	@Test
	@DisplayName("옛 version으로 다시 저장하면 409 PLACEMENT_STALE이고 DB는 앞선 저장 그대로다")
	void 버전_불일치_409() throws Exception {
		JsonNode created = save(ownerId, snapshot("처음", null, List.of()));
		long placementId = created.get("id").asLong();

		// 다음 저장이 쓸 버전은 응답이 알려준다 — 값 자체를 단언하지 않는다. 루트 행이 dirty하면
		// 일반 증가와 OPTIMISTIC_FORCE_INCREMENT가 겹쳐 한 저장에 2씩 오르기도 한다.
		MvcResult firstSave = mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("첫 저장", 0L, List.of(
								item("p1", null, armProductId, null))))))
				.andExpect(status().isOk())
				.andReturn();
		long savedVersion = read(firstSave).get("version").asLong();
		assertThat(savedVersion).isNotZero();

		mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("덮어쓴 저장", 0L, List.of()))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("PLACEMENT_STALE"));

		// 두 번째 요청이 아무것도 쓰지 않았다 — 제목도 아이템도 첫 저장 상태다.
		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("첫 저장"))
				.andExpect(jsonPath("$.version").value((int) savedVersion))
				.andExpect(jsonPath("$.items.length()").value(1));
	}

	@Test
	@DisplayName("저장 응답의 version을 그대로 다시 보내면 연속 저장이 통과한다")
	void 연속_저장() throws Exception {
		JsonNode created = save(ownerId, snapshot("1회", null, List.of(
				item("p1", null, armProductId, null))));
		long placementId = created.get("id").asLong();

		long version = created.get("version").asLong();
		for (int round = 2; round <= 4; round++) {
			MvcResult saved = mockMvc.perform(put("/api/v1/placements/{id}", placementId)
							.header("Authorization", bearer(ownerId))
							.contentType(MediaType.APPLICATION_JSON)
							// 배치 속성은 그대로 두고 아이템만 바꾼다 — 이때 루트 행이 dirty하지 않아
							// version이 안 오르면 다음 회차가 409로 튕긴다.
							.content(json(snapshot("1회", version, List.of(
									item("p" + round, null, monitorProductId, null))))))
					.andExpect(status().isOk())
					.andReturn();
			version = read(saved).get("version").asLong();
		}
	}

	@Test
	@DisplayName("version 없이 보낸 저장은 409다 — 버전 없는 클라이언트가 낙관적 락을 무력화하지 못한다")
	void 버전_누락_409() throws Exception {
		long placementId = save(ownerId, snapshot("처음", null, List.of())).get("id").asLong();

		mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("버전 없음", null, List.of()))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("PLACEMENT_STALE"));
	}

	// --- 상세 복원 ---

	@Test
	@DisplayName("상세가 저장한 스냅샷을 그대로 복원한다 — 좌표·회전·표면·관절·벽 3면·조명·예산")
	void 상세_복원() throws Exception {
		Map<String, Object> arm = item("p1", null, armProductId, null);
		arm.put("rotationDeg", -4.25);
		arm.put("pitchDeg", -12.5);
		arm.put("surfaceType", "WALL");
		arm.put("wallSide", "LEFT");
		arm.put("jointValues", Map.of("base-yaw", 12.5, "pole-lift", 80.0));
		arm.put("emitterColor", "#FF00AA");

		long placementId = save(ownerId, snapshot("복원", null, List.of(arm))).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.publishStatus").value("PRIVATE"))
				.andExpect(jsonPath("$.walls[0].isOn").value(true))
				.andExpect(jsonPath("$.walls[1].isOn").value(true))
				.andExpect(jsonPath("$.walls[2].isOn").value(false))
				.andExpect(jsonPath("$.isRoomLightOn").value(true))
				.andExpect(jsonPath("$.budgetKrw").value(1_500_000))
				.andExpect(jsonPath("$.thumbnailUrl").isEmpty())
				.andExpect(jsonPath("$.desk.specSource").value("CUSTOM"))
				.andExpect(jsonPath("$.desk.widthMm").value(1400))
				// NULL은 0이 아니라 "상판 두께와 같음"이다 — 채워 보내면 재로드한 폼이 사용자가 비워
				// 둔 칸을 채워진 것으로 보여 준다(D21).
				.andExpect(jsonPath("$.desk.edgeThicknessMm").isEmpty())
				.andExpect(jsonPath("$.desk.deskTextureId").value(deskTextureId.intValue()))
				.andExpect(jsonPath("$.items[0].rotationDeg").value(-4.25))
				.andExpect(jsonPath("$.items[0].pitchDeg").value(-12.5))
				.andExpect(jsonPath("$.items[0].surfaceType").value("WALL"))
				.andExpect(jsonPath("$.items[0].wallSide").value("LEFT"))
				.andExpect(jsonPath("$.items[0].jointValues['base-yaw']").value(12.5))
				.andExpect(jsonPath("$.items[0].emitterColor").value("#FF00AA"));
	}

	@Test
	@DisplayName("제품 모드 책상은 카탈로그 규격을 복사한다 — 본문에 실린 치수는 읽지 않는다")
	void 제품_모드_책상() throws Exception {
		long placementId =
				save(ownerId, productDeskSnapshot("제품 책상", null, List.of())).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.desk.specSource").value("PRODUCT"))
				.andExpect(jsonPath("$.desk.productId").value(deskProductId.intValue()))
				.andExpect(jsonPath("$.desk.widthMm").value(1600))
				.andExpect(jsonPath("$.desk.topThicknessMm").value(18))
				.andExpect(jsonPath("$.desk.edgeThicknessMm").value(40))
				.andExpect(jsonPath("$.desk.frameType").value("FOUR_LEG"));
	}

	// --- 방 표면: 벽면 3면·바닥·시간대(ADR-0030, DERO-506) ---

	@Test
	@DisplayName("walls·floor·timeOfDay가 저장 → 조회 왕복에 그대로 보존되고 항상 좌·전면·우 3개다")
	void 방_표면_왕복() throws Exception {
		Map<String, Object> body = snapshot("방 표면", null, List.of());
		body.put("walls", List.of(
				wall("LEFT", true, "WOOD_SLAT", "OAK"),
				windowedWall("FRONT", true, "PAINT", "CHARCOAL", -600, 1600, 1200, 1400),
				wall("RIGHT", false, "BRICK", "RED")));
		body.put("floor", Map.of("material", "TILE", "variant", "GRAY"));
		body.put("timeOfDay", "NIGHT");

		long placementId = save(ownerId, body).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.walls.length()").value(3))
				.andExpect(jsonPath("$.walls[0].wallSide").value("LEFT"))
				.andExpect(jsonPath("$.walls[0].material").value("WOOD_SLAT"))
				.andExpect(jsonPath("$.walls[0].variant").value("OAK"))
				.andExpect(jsonPath("$.walls[0].hasWindow").value(false))
				.andExpect(jsonPath("$.walls[0].windowWidthMm").isEmpty())
				.andExpect(jsonPath("$.walls[1].wallSide").value("FRONT"))
				.andExpect(jsonPath("$.walls[1].hasWindow").value(true))
				.andExpect(jsonPath("$.walls[1].windowCenterXMm").value(-600))
				.andExpect(jsonPath("$.walls[1].windowCenterYMm").value(1600))
				.andExpect(jsonPath("$.walls[1].windowWidthMm").value(1200))
				.andExpect(jsonPath("$.walls[1].windowHeightMm").value(1400))
				.andExpect(jsonPath("$.walls[2].wallSide").value("RIGHT"))
				.andExpect(jsonPath("$.walls[2].isOn").value(false))
				.andExpect(jsonPath("$.floor.material").value("TILE"))
				.andExpect(jsonPath("$.floor.variant").value("GRAY"))
				.andExpect(jsonPath("$.timeOfDay").value("NIGHT"))
				// 벽 표시 여부의 정본도 walls[].isOn이다 — 옛 3컬럼은 V9 축소에서 사라졌다.
				.andExpect(jsonPath("$.walls[0].isOn").value(true));
	}

	@Test
	@DisplayName("벽 거리가 왕복에 보존되고, 생략한 면은 면마다 다른 기본값으로 채워진다")
	void 벽_거리_왕복() throws Exception {
		Map<String, Object> body = snapshot("벽 거리", null, List.of());
		Map<String, Object> left = wall("LEFT", true, "PAINT", "NEUTRAL");
		left.put("distanceMm", 900);
		// 전면·우측은 싣지 않는다 — 같은 저장에서 생략 갈래까지 검증한다.
		body.put("walls", List.of(
				left,
				wall("FRONT", true, "PAINT", "NEUTRAL"),
				wall("RIGHT", false, "PAINT", "NEUTRAL")));

		long placementId = save(ownerId, body).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.walls[0].distanceMm").value(900))
				// 기본값이 면마다 다르다 — 전면은 기준이 책상 뒷변이라 50, 좌·우는 중심 거리라 1550.
				.andExpect(jsonPath("$.walls[1].distanceMm").value(50))
				.andExpect(jsonPath("$.walls[2].distanceMm").value(1550));
	}

	@Test
	@DisplayName("재저장이 벽면을 제자리에서 고친다 — 면당 1행이 유지되고 창문을 지울 수도 있다")
	void 방_표면_재저장() throws Exception {
		Map<String, Object> first = snapshot("재저장", null, List.of());
		first.put("walls", List.of(
				wall("LEFT", true, "PAINT", "NEUTRAL"),
				windowedWall("FRONT", true, "PAINT", "NEUTRAL", 0, 1600, 1200, 1400),
				wall("RIGHT", false, "PAINT", "NEUTRAL")));
		JsonNode created = save(ownerId, first);
		long placementId = created.get("id").asLong();

		Map<String, Object> second = snapshot("재저장", created.get("version").asLong(), List.of());
		second.put("walls", List.of(
				wall("LEFT", false, "MARBLE", "WHITE"),
				wall("FRONT", true, "PAINT", "SAGE"),
				wall("RIGHT", true, "CONCRETE", "DARK")));

		mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(second)))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.walls.length()").value(3))
				.andExpect(jsonPath("$.walls[0].material").value("MARBLE"))
				.andExpect(jsonPath("$.walls[0].isOn").value(false))
				.andExpect(jsonPath("$.walls[1].hasWindow").value(false))
				.andExpect(jsonPath("$.walls[1].windowWidthMm").isEmpty())
				.andExpect(jsonPath("$.walls[2].isOn").value(true));

		// 면당 1행이 유지된다 — 재저장이 행을 갈아끼우면 3행이 아니게 되거나 id가 바뀐다.
		assertThat(jdbc.queryForObject(
				"select count(*) from placement_wall where placement_id = " + placementId,
				Long.class)).isEqualTo(3L);
	}

	@Test
	@DisplayName("walls·floor·timeOfDay를 생략하면 기본값으로 저장된다 — 방 표면을 모르는 클라이언트가 정상이다")
	void 방_표면_생략_기본값() throws Exception {
		// snapshot() 도우미는 walls를 아예 안 싣는다 — 생성이 시드한 3행이 그대로 남는다.
		Map<String, Object> body = snapshot("마감 모름", null, List.of());

		long placementId = save(ownerId, body).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.walls.length()").value(3))
				.andExpect(jsonPath("$.walls[0].isOn").value(true))
				.andExpect(jsonPath("$.walls[0].material").value("PAINT"))
				.andExpect(jsonPath("$.walls[0].variant").value("NEUTRAL"))
				.andExpect(jsonPath("$.walls[1].isOn").value(true))
				.andExpect(jsonPath("$.walls[2].isOn").value(false))
				.andExpect(jsonPath("$.walls[2].hasWindow").value(false))
				.andExpect(jsonPath("$.floor.material").value("WOOD"))
				.andExpect(jsonPath("$.floor.variant").value("OAK"))
				.andExpect(jsonPath("$.timeOfDay").value("DAY"));
	}

	@Test
	@DisplayName("walls를 생략한 재저장은 마감·창문·바닥·시간대를 보존한다 — 옛 클라이언트가 백필을 지우면 안 된다")
	void 생략_재저장_마감_보존() throws Exception {
		Map<String, Object> first = snapshot("보존", null, List.of());
		first.put("walls", List.of(
				wall("LEFT", true, "WOOD_SLAT", "OAK"),
				windowedWall("FRONT", true, "PAINT", "CHARCOAL", 0, 1600, 1200, 1400),
				wall("RIGHT", true, "PAINT", "WARM_GRAY")));
		first.put("floor", Map.of("material", "WOOD", "variant", "WALNUT"));
		first.put("timeOfDay", "NIGHT");
		JsonNode created = save(ownerId, first);
		long placementId = created.get("id").asLong();

		// 옛 클라이언트의 저장 — walls·floor·timeOfDay가 통째로 없다.
		Map<String, Object> legacy = snapshot("보존", created.get("version").asLong(), List.of());
		mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(legacy)))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				// 마감·창문·표시 여부가 전부 그대로다 — 벽면 행을 아예 손대지 않는다.
				.andExpect(jsonPath("$.walls[0].material").value("WOOD_SLAT"))
				.andExpect(jsonPath("$.walls[1].hasWindow").value(true))
				.andExpect(jsonPath("$.walls[1].windowWidthMm").value(1200))
				.andExpect(jsonPath("$.walls[2].variant").value("WARM_GRAY"))
				.andExpect(jsonPath("$.walls[2].isOn").value(true))
				.andExpect(jsonPath("$.floor.variant").value("WALNUT"))
				.andExpect(jsonPath("$.timeOfDay").value("NIGHT"));
	}

	@Test
	@DisplayName("walls에 세 면이 다 오지 않으면 400 PLACEMENT_WALLS_INCOMPLETE다 — 안 온 면이 조용히 초기화되면 안 된다")
	void 벽면_일부만_400() throws Exception {
		Map<String, Object> body = snapshot("두 면", null, List.of());
		body.put("walls", List.of(
				wall("LEFT", true, "PAINT", "NEUTRAL"), wall("FRONT", true, "PAINT", "NEUTRAL")));

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_WALLS_INCOMPLETE"));
	}

	@Test
	@DisplayName("형식에 안 맞는 벽면 마감은 400이다 — 값 화이트리스트가 아니라 형식만 본다")
	void 벽면_마감_형식_위반_400() throws Exception {
		Map<String, Object> body = snapshot("형식 위반", null, List.of());
		body.put("walls", List.of(wall("LEFT", true, "oak-warm", "OAK"),
				wall("FRONT", true, "PAINT", "NEUTRAL"), wall("RIGHT", false, "PAINT", "NEUTRAL")));

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("같은 wallSide가 두 번 실려 오면 400 PLACEMENT_DUPLICATE_WALL_SIDE다")
	void 중복_벽면_400() throws Exception {
		Map<String, Object> body = snapshot("중복 면", null, List.of());
		body.put("walls", List.of(
				wall("LEFT", true, "PAINT", "NEUTRAL"), wall("LEFT", false, "PAINT", "NEUTRAL")));

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_DUPLICATE_WALL_SIDE"));
	}

	@Test
	@DisplayName("hasWindow와 창문 4값이 어긋나면 400 PLACEMENT_INVALID_WINDOW다 — 넷 다 있거나 넷 다 없다")
	void 창문_불완전_400() throws Exception {
		Map<String, Object> half = wall("FRONT", true, "PAINT", "NEUTRAL");
		half.put("hasWindow", true);
		half.put("windowWidthMm", 1200);
		Map<String, Object> body = snapshot("반쪽 창문", null, List.of());
		body.put("walls", List.of(wall("LEFT", true, "PAINT", "NEUTRAL"), half,
				wall("RIGHT", false, "PAINT", "NEUTRAL")));

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_INVALID_WINDOW"));
	}

	@Test
	@DisplayName("material만 오고 variant가 없으면 400이다 — 계열과 변형은 쌍으로 온다")
	void 마감_한쪽만_400() throws Exception {
		Map<String, Object> body = snapshot("한쪽 마감", null, List.of());
		body.put("walls", List.of(wall("LEFT", true, "WOOD_SLAT", null),
				wall("FRONT", true, "PAINT", "NEUTRAL"), wall("RIGHT", false, "PAINT", "NEUTRAL")));

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_WALL_FINISH_PAIR_REQUIRED"));
	}

	@Test
	@DisplayName("바닥 마감이 한쪽만 오면 400 PLACEMENT_FLOOR_FINISH_PAIR_REQUIRED다 — 벽과 다른 코드다")
	void 바닥_마감_한쪽만_400() throws Exception {
		Map<String, Object> body = snapshot("바닥 반쪽", null, List.of());
		Map<String, Object> floor = new HashMap<>();
		floor.put("material", "TILE");
		body.put("floor", floor);

		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_FLOOR_FINISH_PAIR_REQUIRED"));
	}

	// --- 가시성 ---

	@Test
	@DisplayName("비로그인은 남의 비공개 배치 상세에서 404를 받는다 — 403이 아니다")
	void 비로그인_비공개_404() throws Exception {
		long placementId = save(ownerId, snapshot("내 것", null, List.of())).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PLACEMENT_NOT_FOUND"));
	}

	@Test
	@DisplayName("남이 로그인해도 남의 비공개 배치 상세는 404다")
	void 남의_비공개_404() throws Exception {
		long placementId = save(ownerId, snapshot("내 것", null, List.of())).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("소유자는 자기 비공개 배치 상세를 본다")
	void 소유자_비공개_조회() throws Exception {
		long placementId = save(ownerId, snapshot("내 것", null, List.of())).get("id").asLong();

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("내 것"));
	}

	// --- 삭제 ---

	@Test
	@DisplayName("소유자 삭제는 204고 그 뒤 상세에서 사라진다")
	void 삭제_204() throws Exception {
		long placementId = save(ownerId, snapshot("지울 것", null, List.of(
				item("p1", null, armProductId, null)))).get("id").asLong();

		mockMvc.perform(delete("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("남의 배치를 지우려 하면 404다")
	void 남의_배치_삭제_404() throws Exception {
		long placementId = save(ownerId, snapshot("내 것", null, List.of())).get("id").asLong();

		mockMvc.perform(delete("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound());

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk());
	}

	// --- 썸네일 2단계 presign ---

	@Test
	@DisplayName("presign 2단계 — upload-url 200 → key 등록 204 → 상세에 presigned GET URL이 실린다")
	void 썸네일_2단계() throws Exception {
		long placementId = save(ownerId, snapshot("썸네일", null, List.of())).get("id").asLong();

		MvcResult presigned = mockMvc.perform(
						post("/api/v1/placements/{id}/thumbnail/upload-url", placementId)
								.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.uploadUrl").isNotEmpty())
				.andReturn();
		String thumbnailKey = read(presigned).get("thumbnailKey").asText();
		// key는 캡처마다 uuid 버전이다(ADR-0035) — 접두·접미만 고정이다.
		assertThat(thumbnailKey)
				.startsWith("placement-thumbnails/" + placementId + "/")
				.endsWith(".webp");

		mockMvc.perform(put("/api/v1/placements/{id}/thumbnail", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(Map.of("thumbnailKey", thumbnailKey))))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.thumbnailUrl").value(org.hamcrest.Matchers.containsString(
						thumbnailKey)));
	}

	@Test
	@DisplayName("이 배치의 key가 아니면 썸네일 등록은 400이다")
	void 썸네일_key_불일치_400() throws Exception {
		long placementId = save(ownerId, snapshot("썸네일", null, List.of())).get("id").asLong();

		mockMvc.perform(put("/api/v1/placements/{id}/thumbnail", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(Map.of("thumbnailKey", "placement-thumbnails/999999.webp"))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_INVALID_THUMBNAIL_KEY"));
	}

	// --- 저장 회귀: 버전 오염과 상속 프록시(DERO-360) ---

	@Test
	@DisplayName("썸네일 key 등록은 version을 올리지 않는다 — 씬 스냅샷 변경이 아니다")
	void 썸네일_등록은_version_불변() throws Exception {
		JsonNode created = save(ownerId, snapshot("썸네일", null, List.of()));
		long placementId = created.get("id").asLong();
		long version = created.get("version").asLong();

		registerThumbnail(placementId);

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.version").value((int) version));
	}

	@Test
	@DisplayName("썸네일 등록 뒤에도 저장 응답의 version 그대로 저장된다 — 제품 모드 책상도 200이다")
	void 썸네일_등록_뒤_저장() throws Exception {
		JsonNode created = save(ownerId, productDeskSnapshot("제품 책상", null, List.of()));
		long placementId = created.get("id").asLong();

		registerThumbnail(placementId);

		// 클라이언트가 아는 version은 저장 응답의 것뿐이다. 썸네일이 version을 올렸다면 여기서
		// 409(버전 오염)이고, 상속 프록시를 안 풀면 400(책상이 아니다)이다.
		mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(productDeskSnapshot(
								"고친 제목", created.get("version").asLong(), List.of()))))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("제품 모드 책상을 연달아 저장해도 200이고 PRODUCT가 유지된다")
	void 제품_모드_책상_연속_저장() throws Exception {
		JsonNode created = save(ownerId, productDeskSnapshot("제품 책상", null, List.of()));
		long placementId = created.get("id").asLong();

		long version = created.get("version").asLong();
		for (int round = 1; round <= 2; round++) {
			MvcResult saved = mockMvc.perform(put("/api/v1/placements/{id}", placementId)
							.header("Authorization", bearer(ownerId))
							.contentType(MediaType.APPLICATION_JSON)
							.content(json(productDeskSnapshot("저장 " + round, version, List.of()))))
					.andExpect(status().isOk())
					.andReturn();
			version = read(saved).get("version").asLong();
		}

		mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.desk.specSource").value("PRODUCT"))
				.andExpect(jsonPath("$.desk.productId").value(deskProductId.intValue()));
	}

	@Test
	@DisplayName("업데이트 경로에서도 위반이 보고된다 — 상속 프록시로 판정이 조용히 사라지지 않는다")
	void 업데이트_경로_판정_유지() throws Exception {
		JsonNode created = save(ownerId, snapshot("판정", null, List.of(
				item("p1", null, oversizedPropProductId, null))));
		assertThat(created.get("violations")).isNotEmpty();
		long itemId = created.get("items").get(0).get("id").asLong();

		// 같은 아이템을 그대로 다시 저장한다. findForUpdateById가 placed_item.product를 베이스 타입
		// 프록시로 꽂아 두므로, unproxy 없이는 PlacementJudge의 instanceof가 전부 거짓이 된다.
		MvcResult updated = mockMvc.perform(put("/api/v1/placements/{id}", created.get("id").asLong())
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("판정", created.get("version").asLong(), List.of(
								item("p1", itemId, oversizedPropProductId, null))))))
				.andExpect(status().isOk())
				.andReturn();

		assertThat(read(updated).get("violations")).isNotEmpty();
	}

	@Test
	@DisplayName("아이템만 늘어난 재저장도 updated_at을 찍는다 — 루트 필드가 안 바뀌어도 감사가 돈다")
	void 아이템만_바뀐_저장도_수정시각_기록() throws Exception {
		// 생성 시점의 updated_at은 NULL이 정본이다(JpaAuditingConfig의 modifyOnCreate = false).
		JsonNode created = save(ownerId, snapshot("빈 책상", null, List.of()));
		assertThat(created.get("updatedAt").isNull()).isTrue();
		long placementId = created.get("id").asLong();

		// 제목·벽·예산은 그대로 두고 아이템만 추가한다 — 루트 행이 안 더러워지는 조합이라 dirty
		// checking에만 맡기면 @LastModifiedDate가 영원히 안 돈다(2026-08-02 운영 배치 206).
		MvcResult updated = mockMvc.perform(put("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("빈 책상", created.get("version").asLong(), List.of(
								item("p1", null, monitorProductId, null))))))
				.andExpect(status().isOk())
				.andReturn();
		assertThat(read(updated).get("updatedAt").isNull()).isFalse();

		// 응답만 채우고 커밋이 안 되는 경우를 배제한다 — 별도 요청으로 다시 읽는다.
		MvcResult detail = mockMvc.perform(get("/api/v1/placements/{id}", placementId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn();
		assertThat(read(detail).get("updatedAt").isNull()).isFalse();
	}

	// --- ref 그래프 검증 ---

	@Test
	@DisplayName("ref가 중복되면 400 PLACEMENT_DUPLICATE_ITEM_REF다")
	void ref_중복_400() throws Exception {
		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("중복", null, List.of(
								item("p1", null, armProductId, null),
								item("p1", null, monitorProductId, null))))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_DUPLICATE_ITEM_REF"));
	}

	@Test
	@DisplayName("없는 ref를 mountedToRef로 가리키면 400 PLACEMENT_UNKNOWN_ITEM_REF다")
	void 미지의_참조_400() throws Exception {
		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("미지", null, List.of(
								item("p2", null, monitorProductId, "없는-ref"))))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_UNKNOWN_ITEM_REF"));
	}

	@Test
	@DisplayName("자기 자신 참조는 400 PLACEMENT_INVALID_MOUNT다")
	void 자기_참조_400() throws Exception {
		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("자기참조", null, List.of(
								item("p1", null, armProductId, "p1"))))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_INVALID_MOUNT"));
	}

	@Test
	@DisplayName("순환 결합은 400 PLACEMENT_INVALID_MOUNT다")
	void 순환_결합_400() throws Exception {
		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("순환", null, List.of(
								item("p1", null, armProductId, "p2"),
								item("p2", null, monitorProductId, "p1"))))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_INVALID_MOUNT"));
	}

	@Test
	@DisplayName("이 배치 소속이 아닌 아이템 id를 끼워 넣으면 403 PLACEMENT_ITEM_NOT_OWNED다")
	void 남의_아이템_id_403() throws Exception {
		JsonNode mine = save(ownerId, snapshot("내 것", null, List.of(
				item("p1", null, armProductId, null))));
		JsonNode other = save(ownerId, snapshot("다른 배치", null, List.of(
				item("q1", null, monitorProductId, null))));
		long foreignItemId = other.get("items").get(0).get("id").asLong();

		mockMvc.perform(put("/api/v1/placements/{id}", mine.get("id").asLong())
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot("침범", 0L, List.of(
								item("p1", foreignItemId, armProductId, null))))))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("PLACEMENT_ITEM_NOT_OWNED"));
	}

	// --- 도우미 ---

	private JsonNode save(Long userId, Map<String, Object> body) throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(body)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result);
	}

	/** 2단계 presign의 2단계만 — 검증이 접두({id}/)·접미(.webp) 비교라 uuid 자리는 아무 값이어도 된다. */
	private void registerThumbnail(long placementId) throws Exception {
		mockMvc.perform(put("/api/v1/placements/{id}/thumbnail", placementId)
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(Map.of(
								"thumbnailKey",
								"placement-thumbnails/" + placementId + "/test.webp"))))
				.andExpect(status().isNoContent());
	}

	private JsonNode itemById(JsonNode detail, long itemId) {
		for (JsonNode item : detail.get("items")) {
			if (item.get("id").asLong() == itemId) {
				return item;
			}
		}
		throw new AssertionError("상세 응답에 아이템 %d가 없다".formatted(itemId));
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

	private Map<String, Object> snapshot(String title, Long version, List<?> items) {
		Map<String, Object> body = new HashMap<>();
		body.put("title", title);
		body.put("description", null);
		body.put("version", version);
		body.put("isRoomLightOn", true);
		body.put("budgetKrw", 1_500_000);
		body.put("desk", customDesk());
		body.put("items", items);
		return body;
	}

	/** 제품 모드 책상 스냅샷. 본문의 치수는 일부러 1로 넣는다 — 서버가 안 읽는다는 것이 계약이다. */
	private Map<String, Object> productDeskSnapshot(String title, Long version, List<?> items) {
		Map<String, Object> body = snapshot(title, version, items);
		Map<String, Object> desk = new HashMap<>();
		desk.put("specSource", "PRODUCT");
		desk.put("productId", deskProductId);
		desk.put("widthMm", 1);
		desk.put("depthMm", 1);
		desk.put("heightMm", 1);
		desk.put("topThicknessMm", 1);
		desk.put("edgeThicknessMm", 1);
		desk.put("deskTextureId", deskTextureId);
		desk.put("frameType", "TOP_ONLY");
		body.put("desk", desk);
		return body;
	}

	private Map<String, Object> wall(String wallSide, boolean isOn, String material,
			String variant) {
		Map<String, Object> wall = new HashMap<>();
		wall.put("wallSide", wallSide);
		wall.put("isOn", isOn);
		wall.put("material", material);
		wall.put("variant", variant);
		return wall;
	}

	private Map<String, Object> windowedWall(String wallSide, boolean isOn, String material,
			String variant, int centerXMm, int centerYMm, int widthMm, int heightMm) {
		Map<String, Object> wall = wall(wallSide, isOn, material, variant);
		wall.put("hasWindow", true);
		wall.put("windowCenterXMm", centerXMm);
		wall.put("windowCenterYMm", centerYMm);
		wall.put("windowWidthMm", widthMm);
		wall.put("windowHeightMm", heightMm);
		return wall;
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

	private Map<String, Object> item(String ref, Long id, Long productId, String mountedToRef) {
		Map<String, Object> item = new HashMap<>();
		item.put("ref", ref);
		item.put("id", id);
		item.put("productId", productId);
		item.put("positionXMm", -200);
		item.put("positionYMm", 720);
		item.put("positionZMm", -150);
		item.put("rotationDeg", 0.0);
		item.put("surfaceType", "TOP");
		item.put("wallSide", null);
		item.put("mountedToRef", mountedToRef);
		item.put("jointValues", null);
		item.put("emitterColor", null);
		return item;
	}
}
