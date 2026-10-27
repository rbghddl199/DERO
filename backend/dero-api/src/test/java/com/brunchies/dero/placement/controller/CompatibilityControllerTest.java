package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.ArmKind;
import com.brunchies.dero.product.ArmMounting;
import com.brunchies.dero.product.ArmType;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.PanelShape;
import com.brunchies.dero.product.Product;
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
import java.util.stream.StreamSupport;
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
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서버 판정 엔진을 <b>HTTP 시임</b>으로 검증한다 — 즉답 판정({@code POST /compatibility/judgments})과
 * 저장 경로의 경고({@code violations}) 둘 다 같은 순수 함수를 통과하는지 본다.
 *
 * <p>판정 <b>규칙</b> 자체는 여기서 다시 세우지 않는다 — 그건 언어 중립 fixture 계약 테스트
 * ({@code JudgmentFixtureContractTest})의 몫이다. 여기가 지는 것은 <b>배선</b>이다: 인가, 상태 코드,
 * 저장 여부, 엔티티 → 규격 값 변환.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PlacementControllerTest}와 같다 — 실패 경로가 공유 트랜잭션을
 * rollback-only로 만들면 뒤따르는 검증 조회가 통째로 죽는다. 격리는 {@link #tearDown}의 truncate가 맡는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CompatibilityControllerTest extends AbstractPostgresIntegrationTest {

	private static final String JUDGMENTS = "/api/v1/compatibility/judgments";

	@Autowired
	private MockMvc mockMvc;

	/** 컨테이너에서 주입받지 않는다 — Boot 4는 Jackson 3으로 옮겨 가 이 타입의 빈이 없다. */
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
	private VesaSpecRepository vesaSpecs;

	@Autowired
	private ProductRepository products;

	@Autowired
	private JdbcTemplate jdbc;

	private Long ownerId;
	private Long deskTextureId;
	private Long thinDeskId;
	private Long thickEdgeDeskId;
	private Long clampArmId;
	private Long micClampArmId;
	private Long standArmId;
	private Long unregisteredClampArmId;
	private Long lightMonitorId;
	private Long heavyMonitorId;
	private Long propId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인")).getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskTextureId = texture.getId();

		VesaSpec vesa100 = vesaSpecs.save(VesaSpec.create(100, 100));
		VesaSpec vesa75 = vesaSpecs.save(VesaSpec.create(75, 75));

		// 상판 25 / 엣지 25 — 클램프 10~40에 들어간다.
		thinDeskId = saveDesk(category, texture, "얇은 상판 책상", 25, 25);
		// 상판 18 / 엣지 45 — 상판만 보면 적합인 D21의 그 조합이다.
		thickEdgeDeskId = saveDesk(category, texture, "두꺼운 엣지 몰딩 책상", 18, 45);

		clampArmId = saveArm(category, ArmKind.MONITOR, ArmType.ARTICULATED,
				new ArmMounting(true, true, false), 10, 40, 5_000, List.of(vesa100));
		// arm_kind = MIC여도 게이트가 true면 판정 ①을 똑같이 받는다.
		micClampArmId = saveArm(category, ArmKind.MIC, ArmType.ARTICULATED,
				new ArmMounting(true, false, false), 10, 40, 3_000, List.of());
		// 자립형 — 마운트 boolean 3종이 전부 false다(엔티티가 강제한다).
		standArmId = saveArm(category, ArmKind.MONITOR, ArmType.STAND,
				new ArmMounting(false, false, false), null, null, 8_000, List.of(vesa100));
		unregisteredClampArmId = saveArm(category, ArmKind.MONITOR, ArmType.POLE,
				new ArmMounting(true, false, false), null, null, 5_000, List.of(vesa100));

		lightMonitorId = saveMonitor(category, "27인치", 4_200, List.of(vesa100));
		heavyMonitorId = saveMonitor(category, "34인치 커브드", 7_100, List.of(vesa75));

		propId = products.save(Prop.create(ProductSource.CATALOG, null, null, category, "키보드",
				null, 120_000, null, 360, 140, 40, 900, false, MountSurface.TOP)).getId();
	}

	/** 각 요청이 커밋되므로 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE placed_item, placement_desk, placement, product_vesa, product,
					vesa_spec, desk_texture, category, "user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 즉답 판정 (POST /compatibility/judgments) ---

	@Test
	@DisplayName("비로그인도 200이다 — 저장하는 게 없어 201도 Location도 없다")
	void 비로그인_200() throws Exception {
		mockMvc.perform(judge(null, customDesk(25, 25), List.of(item("a1", clampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(mvcResult -> assertThat(
						mvcResult.getResponse().getHeader("Location")).isNull())
				.andExpect(jsonPath("$.judgments[0].kind").value("ARM_DESK"))
				.andExpect(jsonPath("$.judgments[0].result").value("FIT"))
				.andExpect(jsonPath("$.judgments[0].reasons.length()").value(0));
	}

	@Test
	@DisplayName("판정은 아무것도 저장하지 않는다 — 배치·아이템 행이 생기지 않는다")
	void 무저장() throws Exception {
		mockMvc.perform(judge(ownerId, customDesk(18, 45), List.of(item("a1", clampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("INCOMPATIBLE"));

		assertThat(jdbc.queryForObject("select count(*) from placement", Long.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from placed_item", Long.class)).isZero();
	}

	@Test
	@DisplayName("클램프 물림 두께는 max(상판, 엣지 마감)이고 사유에 출처를 병기한다 (D21)")
	void 물림_두께는_엣지를_포함한다() throws Exception {
		MvcResult result = mockMvc
				.perform(judge(null, customDesk(18, 45), List.of(item("a1", clampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("INCOMPATIBLE"))
				.andReturn();

		assertThat(read(result).get("judgments").get(0).get("reasons").get(0).asText())
				.isEqualTo("물림 두께 45mm(엣지 마감) > 클램프 최대 40mm");
	}

	@Test
	@DisplayName("엣지 미등록(NULL)은 0이 아니라 상판 두께로 COALESCE된다")
	void 엣지_NULL은_상판으로_메운다() throws Exception {
		mockMvc.perform(judge(null, customDesk(30, null), List.of(item("a1", clampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("FIT"));
	}

	@Test
	@DisplayName("is_clamp_mountable = false인 암은 판정 ① 행이 아예 없다 (불가가 아니다)")
	void 게이트가_false면_행이_없다() throws Exception {
		mockMvc.perform(judge(null, customDesk(100, 100), List.of(item("a1", standArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments.length()").value(0));
	}

	@Test
	@DisplayName("클램프 물림 규격 미등록은 조건부다 — 적합으로 떨어뜨리지 않는다")
	void 물림_규격_미등록은_조건부() throws Exception {
		mockMvc.perform(
						judge(null, customDesk(25, 25), List.of(item("a1", unregisteredClampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("CONDITIONAL"))
				.andExpect(jsonPath("$.judgments[0].reasons[0]")
						.value("클램프 물림 규격 미등록 — 제조사 사양 확인 필요"));
	}

	@Test
	@DisplayName("arm_kind = MIC 마이크암도 게이트가 true면 판정 ①을 똑같이 받는다")
	void 마이크암도_판정한다() throws Exception {
		mockMvc.perform(judge(null, customDesk(18, 45), List.of(item("a1", micClampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].kind").value("ARM_DESK"))
				.andExpect(jsonPath("$.judgments[0].result").value("INCOMPATIBLE"));
	}

	@Test
	@DisplayName("판정 ② — VESA 불일치와 하중 초과가 겹치면 사유가 둘 다 실린다")
	void 판정2_사유_2건() throws Exception {
		MvcResult result = mockMvc.perform(judge(null, customDesk(25, 25), List.of(
						item("a1", clampArmId, null), item("m1", heavyMonitorId, "a1"))))
				.andExpect(status().isOk())
				.andReturn();

		JsonNode row = rowOf(read(result), "MONITOR_ARM");
		assertThat(row.get("ref").asText()).isEqualTo("m1");
		assertThat(row.get("targetRef").asText()).isEqualTo("a1");
		assertThat(row.get("result").asText()).isEqualTo("INCOMPATIBLE");
		assertThat(texts(row.get("reasons")))
				.containsExactly("VESA 75×75 불일치", "모니터 7.1kg > 허용 5kg");
	}

	@Test
	@DisplayName("판정 ② — VESA 일치 + 하중 여유면 적합")
	void 판정2_적합() throws Exception {
		MvcResult result = mockMvc.perform(judge(null, customDesk(25, 25), List.of(
						item("a1", clampArmId, null), item("m1", lightMonitorId, "a1"))))
				.andExpect(status().isOk())
				.andReturn();

		assertThat(rowOf(read(result), "MONITOR_ARM").get("result").asText()).isEqualTo("FIT");
	}

	@Test
	@DisplayName("판정 ③ — 소품이 상판 면적을 넘으면 불가")
	void 판정3_면적_초과() throws Exception {
		MvcResult result = mockMvc
				.perform(judge(null, customDesk(300, 100, 25, 25), List.of(item("p1", propId, null))))
				.andExpect(status().isOk())
				.andReturn();

		JsonNode row = rowOf(read(result), "PROP_DESK");
		assertThat(row.get("result").asText()).isEqualTo("INCOMPATIBLE");
		assertThat(texts(row.get("reasons")))
				.containsExactly("소품 폭 360mm > 상판 폭 300mm", "소품 깊이 140mm > 상판 깊이 100mm");
	}

	@Test
	@DisplayName("제품 모드 책상은 카탈로그 규격을 쓴다 — 본문에 실린 치수는 읽지 않는다")
	void 제품_모드_책상은_본문_치수를_무시한다() throws Exception {
		Map<String, Object> desk = new HashMap<>();
		desk.put("specSource", "PRODUCT");
		desk.put("productId", thickEdgeDeskId);
		// 위조 시도 — 통과하면 규격을 속인 판정이 성립한다.
		desk.put("topThicknessMm", 25);
		desk.put("edgeThicknessMm", 25);

		mockMvc.perform(judge(null, desk, List.of(item("a1", clampArmId, null))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("INCOMPATIBLE"));
	}

	@Test
	@DisplayName("클라이언트가 판정 결과를 본문에 실어 보내도 무시한다")
	void 클라이언트_판정은_신뢰하지_않는다() throws Exception {
		Map<String, Object> item = item("a1", clampArmId, null);
		item.put("result", "FIT");
		item.put("judgment", Map.of("result", "FIT", "reasons", List.of()));

		mockMvc.perform(judge(null, customDesk(18, 45), List.of(item)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.judgments[0].result").value("INCOMPATIBLE"));
	}

	@Test
	@DisplayName("없는 제품을 참조하면 400 PLACEMENT_UNKNOWN_PRODUCT")
	void 없는_제품은_400() throws Exception {
		mockMvc.perform(judge(null, customDesk(25, 25), List.of(item("a1", 999_999L, null))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PLACEMENT_UNKNOWN_PRODUCT"));
	}

	// --- 저장 경로의 경고 (ADR-0009 결정 6) ---

	@Test
	@DisplayName("저장 응답에 규격 위반 경고가 실리고 저장 자체는 성공한다 (ADR-0009 결정 5)")
	void 저장은_성공하고_경고만_싣는다() throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot(18, 45, List.of(
								placedItem("a1", clampArmId, null),
								placedItem("m1", heavyMonitorId, "a1"))))))
				.andExpect(status().isCreated())
				.andReturn();

		JsonNode violations = read(result).get("violations");
		assertThat(texts(violations, "code"))
				.containsExactlyInAnyOrder("ARM_DESK_INCOMPATIBLE", "MONITOR_ARM_INCOMPATIBLE");
		assertThat(texts(violations, "message"))
				.anyMatch(message -> message.contains("물림 두께 45mm(엣지 마감)"))
				.anyMatch(message -> message.contains("모니터 7.1kg > 허용 5kg"));
		assertThat(jdbc.queryForObject("select count(*) from placement", Long.class)).isEqualTo(1L);
	}

	@Test
	@DisplayName("규격에 맞는 배치의 저장 응답은 경고가 비어 있다")
	void 적합한_배치는_경고가_없다() throws Exception {
		mockMvc.perform(post("/api/v1/placements")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(json(snapshot(25, 25, List.of(
								placedItem("a1", clampArmId, null),
								placedItem("m1", lightMonitorId, "a1"))))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.violations.length()").value(0));
	}

	// --- 픽스처 ---

	private Long saveDesk(Category category, DeskTexture texture, String name, int topThicknessMm,
			int edgeThicknessMm) {
		return products.save(Desk.create(ProductSource.CATALOG, null, null, category, name, null,
				300_000, null, 1600, 800, 730, topThicknessMm, edgeThicknessMm, false, texture,
				FrameType.FOUR_LEG, null)).getId();
	}

	private Long saveArm(Category category, ArmKind armKind, ArmType armType, ArmMounting mounting,
			Integer clampMinMm, Integer clampMaxMm, int allowedLoadG, List<VesaSpec> vesa) {
		Arm arm = Arm.create(ProductSource.CATALOG, null, null, category,
				"%s %s 암".formatted(armKind, armType), null, 89_000, null, armKind, armType, 1, 2,
				null, 200, 500, 200, 500, mounting, clampMinMm, clampMaxMm, -5, 90, 180, null,
				false, true, allowedLoadG);
		return saveWithVesa(arm, vesa);
	}

	private Long saveMonitor(Category category, String name, int weightG, List<VesaSpec> vesa) {
		Monitor monitor = Monitor.create(ProductSource.CATALOG, null, null, category, name, null,
				350_000, null, new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130,
				true, false, null, null, -5, 20, weightG, List.of("HDMI"));
		return saveWithVesa(monitor, vesa);
	}

	private Long saveWithVesa(Product product, List<VesaSpec> vesa) {
		product.replaceVesaSpecs(vesa);
		return products.save(product).getId();
	}

	// --- 요청 조립 ---

	private RequestBuilder judge(Long userId, Map<String, Object> desk, List<?> items)
			throws Exception {
		Map<String, Object> body = new HashMap<>();
		body.put("desk", desk);
		body.put("items", items);

		MockHttpServletRequestBuilder request =
				post(JUDGMENTS).contentType(MediaType.APPLICATION_JSON).content(json(body));
		return userId == null ? request : request.header("Authorization", bearer(userId));
	}

	private Map<String, Object> customDesk(Integer topThicknessMm, Integer edgeThicknessMm) {
		return customDesk(1600, 800, topThicknessMm, edgeThicknessMm);
	}

	private Map<String, Object> customDesk(
			int widthMm, int depthMm, Integer topThicknessMm, Integer edgeThicknessMm) {
		Map<String, Object> desk = new HashMap<>();
		desk.put("specSource", "CUSTOM");
		desk.put("productId", null);
		desk.put("widthMm", widthMm);
		desk.put("depthMm", depthMm);
		desk.put("topThicknessMm", topThicknessMm);
		desk.put("edgeThicknessMm", edgeThicknessMm);
		return desk;
	}

	private Map<String, Object> item(String ref, Long productId, String mountedToRef) {
		Map<String, Object> item = new HashMap<>();
		item.put("ref", ref);
		item.put("productId", productId);
		item.put("mountedToRef", mountedToRef);
		return item;
	}

	private Map<String, Object> snapshot(int topThicknessMm, int edgeThicknessMm, List<?> items) {
		Map<String, Object> body = new HashMap<>();
		body.put("title", "판정 대상 배치");
		body.put("description", null);
		body.put("version", null);
		body.put("isRoomLightOn", true);
		body.put("budgetKrw", 1_500_000);

		Map<String, Object> desk = customDesk(topThicknessMm, edgeThicknessMm);
		desk.put("heightMm", 720);
		desk.put("deskTextureId", deskTextureId);
		desk.put("frameType", "T_FRAME");
		body.put("desk", desk);
		body.put("items", items);
		return body;
	}

	private Map<String, Object> placedItem(String ref, Long productId, String mountedToRef) {
		Map<String, Object> item = item(ref, productId, mountedToRef);
		item.put("id", null);
		item.put("positionXMm", -200);
		item.put("positionYMm", 720);
		item.put("positionZMm", -150);
		item.put("rotationDeg", 0.0);
		item.put("surfaceType", "TOP");
		item.put("wallSide", null);
		item.put("jointValues", null);
		item.put("emitterColor", null);
		return item;
	}

	// --- 응답 읽기 ---

	private JsonNode rowOf(JsonNode body, String kind) {
		for (JsonNode row : body.get("judgments")) {
			if (row.get("kind").asText().equals(kind)) {
				return row;
			}
		}
		throw new AssertionError("응답에 %s 판정 행이 없다: %s".formatted(kind, body));
	}

	private List<String> texts(JsonNode array) {
		return StreamSupport.stream(array.spliterator(), false).map(JsonNode::asText).toList();
	}

	private List<String> texts(JsonNode array, String field) {
		return StreamSupport.stream(array.spliterator(), false)
				.map(node -> node.get(field).asText())
				.toList();
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
}
