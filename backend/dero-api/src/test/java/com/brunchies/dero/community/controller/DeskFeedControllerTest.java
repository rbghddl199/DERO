package com.brunchies.dero.community.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code /desk-feeds} — 목록·작성·상세·수정·삭제를 <b>HTTP 시임</b>으로 검증한다
 * (DERO-561, D32·ADR-0033).
 *
 * <p>못 박는 것 다섯이다. ① <b>비로그인도 목록·상세를 200으로 본다</b>(🔓 — 크롤러·SSR이 읽는
 * 응답이라 세션 딸린 필드가 없다, D34·ADR-0037 결정 4). ② <b>배치 첨부는 본인 소유 + PUBLIC만
 * 통과하고 위반은 422다</b>(ADR-0033 결정 3 — 400이 아니다, api-spec.md §6-보).
 * ③ <b>첨부 배치가 공개취소되면 FK는 남고 응답의 배치 요약만 {@code null}이 된다</b>(결정 5).
 * ④ <b>본문은 마크다운 필수이고 인라인 이미지 1~30장이 아니면 422다</b>(ADR-0037 결정 1, 상한은 2026-08-11 30장으로 상향).
 * ⑤ <b>사진은 등록·삭제 엔드포인트가 관리하고 순서·대표는 본문이 정한다</b> — 목록 카드의
 * {@code coverUrl}은 본문 첫 이미지, {@code imageCount}는 레지스트리 행 수다.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PostControllerTest}와 같다 — MockMvc 요청이 테스트
 * 트랜잭션에 참여하면 실패 경로가 rollback-only를 만들어 뒤의 검증이 통째로 죽는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DeskFeedControllerTest extends AbstractPostgresIntegrationTest {

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
	private CategoryRepository categories;

	@Autowired
	private ProductRepository products;

	@Autowired
	private JdbcTemplate jdbc;

	private Long authorId;
	private Long strangerId;

	/** {@link #seedProduct}가 재사용하는 카테고리 — 제품마다 만들면 이름 유니크에 걸릴 수 있다. */
	private Category propCategory;

	@BeforeEach
	void setUp() {
		authorId = users.save(User.create("author@example.com", Provider.KAKAO, "p-author", "글쓴이"))
				.getId();
		strangerId =
				users.save(User.create("other@example.com", Provider.KAKAO, "p-other", "남")).getId();
	}

	/** 테스트 트랜잭션이 없어 각 요청이 커밋된다 — 다음 테스트에 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE desk_feed_hashtag, desk_feed_image_product, desk_feed_image, desk_feed_like,
					desk_feed_comment, desk_feed_product, desk_feed, hashtag, placed_item,
					placement_desk, placement, product_image, product, category,
					"user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 목록 ---

	@Test
	@DisplayName("비로그인 목록은 200이다 — 게시 상태가 없어 전부 보인다")
	void 비로그인_목록은_200() throws Exception {
		long id = create(authorId, "내 책상", List.of("미니멀"), null);

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(id))
				.andExpect(jsonPath("$.content[0].nickname").value("글쓴이"))
				.andExpect(jsonPath("$.content[0].hashtags[0]").value("미니멀"))
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("?hashtag는 그 태그가 붙은 글만, ?owner=me는 내 글만 돌려준다")
	void 필터() throws Exception {
		long tagged = create(authorId, "태그 글", List.of("원목"), null);
		create(strangerId, "남의 글", List.of(), null);

		List<Long> byTag = idsOf(mockMvc.perform(get("/api/v1/desk-feeds").param("hashtag", "원목"))
				.andExpect(status().isOk())
				.andReturn());
		assertThat(byTag).containsExactly(tagged);

		List<Long> mine = idsOf(mockMvc.perform(get("/api/v1/desk-feeds")
						.param("owner", "me")
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andReturn());
		assertThat(mine).containsExactly(tagged);
	}

	@Test
	@DisplayName("?placementId는 그 배치를 첨부한 글만 돌려준다 — 역방향 조회(이 배치의 실사 사진)")
	void 역방향_조회() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PUBLIC);
		long attached = create(authorId, "연결 글", List.of(), placementId);
		create(authorId, "무연결 글", List.of(), null);

		List<Long> picked = idsOf(mockMvc.perform(
						get("/api/v1/desk-feeds").param("placementId", String.valueOf(placementId)))
				.andExpect(status().isOk())
				.andReturn());
		assertThat(picked).containsExactly(attached);
	}

	@Test
	@DisplayName("?sort=popular은 like_count 내림차순이다")
	void 인기순() throws Exception {
		long quiet = create(authorId, "조용한 글", List.of(), null);
		long hot = create(authorId, "인기 글", List.of(), null);
		mockMvc.perform(put("/api/v1/desk-feeds/" + hot + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNoContent());

		List<Long> ordered = idsOf(mockMvc.perform(get("/api/v1/desk-feeds")
						.param("sort", "popular"))
				.andExpect(status().isOk())
				.andReturn());
		assertThat(ordered).containsExactly(hot, quiet);
	}

	@Test
	@DisplayName("커서를 끝까지 순회해도 중복·누락이 없다")
	void 커서_해피패스() throws Exception {
		List<Long> seeded = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			seeded.add(create(authorId, "글 " + i, List.of(), null));
		}

		assertThat(walkAllPages()).containsExactlyInAnyOrderElementsOf(seeded);
	}

	// --- 작성·상세 ---

	@Test
	@DisplayName("작성은 201 + Location이고 상세가 제목·마크다운 본문·태그를 그대로 돌려준다")
	void 작성_201() throws Exception {
		String draft = "이렇게 꾸몄어요\n\n![](blob:draft-1)";
		MvcResult result = mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("내 첫 책상", draft, List.of("우드톤"), null)))
				.andExpect(status().isCreated())
				.andExpect(header().exists("Location"))
				.andExpect(jsonPath("$.title").value("내 첫 책상"))
				.andExpect(jsonPath("$.hashtags[0]").value("우드톤"))
				.andExpect(jsonPath("$.likeCount").value(0))
				.andReturn();

		long id = read(result).get("id").asLong();
		assertThat(result.getResponse().getHeader("Location"))
				.isEqualTo("/api/v1/desk-feeds/" + id);
		// 사진 0장 상태라 상세는 작성자만 본다(노출 게이트) — 본인 조회로 확인한다.
		mockMvc.perform(get("/api/v1/desk-feeds/" + id).header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content").value(draft))
				.andExpect(jsonPath("$.images.length()").value(0));
	}

	@Test
	@DisplayName("비로그인 작성은 401, 제목·본문 누락과 태그 6개는 400이다 — 본문은 이제 필수다")
	void 작성_거절() throws Exception {
		mockMvc.perform(post("/api/v1/desk-feeds")
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", draftContent("본문"), List.of(), null)))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(" ", draftContent("본문"), List.of(), null)))
				.andExpect(status().isBadRequest());

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", null, List.of(), null)))
				.andExpect(status().isBadRequest());

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", draftContent("본문"),
								List.of("1", "2", "3", "4", "5", "6"), null)))
				.andExpect(status().isBadRequest());
	}

	@Test
	@DisplayName("본문 인라인 이미지가 0장이거나 31장이면 422다 — 형식이 아니라 의미 규칙이다")
	void 본문_이미지_장수는_422() throws Exception {
		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", "사진 없는 본문", List.of(), null)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_CONTENT_IMAGE_COUNT_INVALID"));

		StringBuilder overLimit = new StringBuilder("본문");
		for (int i = 0; i < 31; i++) {
			overLimit.append("\n\n![](blob:draft-").append(i).append(')');
		}
		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", overLimit.toString(), List.of(), null)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_CONTENT_IMAGE_COUNT_INVALID"));
	}

	// --- 배치 첨부 게이트 (ADR-0033 결정 3 — 422) ---

	@Test
	@DisplayName("본인의 공개 배치 첨부는 통과하고 상세에 요약 카드가 실린다")
	void 본인_공개_배치_첨부_통과() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PUBLIC);
		long id = create(authorId, "연결 글", List.of(), placementId);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.placementId").value(placementId))
				.andExpect(jsonPath("$.placement.id").value(placementId))
				.andExpect(jsonPath("$.placement.title").value("배치"));
	}

	@Test
	@DisplayName("내 비공개 배치 첨부는 422이고 배치는 자동 공개되지 않는다")
	void 내_비공개_배치는_422() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PRIVATE);

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", draftContent("본문"), List.of(), placementId)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_PLACEMENT_NOT_ATTACHABLE"));

		assertThat(jdbc.queryForObject(
				"select publish_status from placement where id = ?", String.class, placementId))
				.isEqualTo("PRIVATE");
	}

	@Test
	@DisplayName("남의 공개 배치·없는 배치도 같은 422다 — 존재 여부를 흘리지 않는다")
	void 남의_배치와_없는_배치는_422() throws Exception {
		long placementId = seedPlacement(strangerId, PublishStatus.PUBLIC);

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", draftContent("본문"), List.of(), placementId)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_PLACEMENT_NOT_ATTACHABLE"));

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("제목", draftContent("본문"), List.of(), 999_999L)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_PLACEMENT_NOT_ATTACHABLE"));
	}

	@Test
	@DisplayName("첨부 배치가 공개취소되면 placementId는 남고 placement 요약만 null이다 — 카드 숨김")
	void 공개취소는_요약만_숨긴다() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PUBLIC);
		long id = create(authorId, "연결 글", List.of(), placementId);

		jdbc.update("update placement set publish_status = 'PRIVATE' where id = ?", placementId);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.placementId").value(placementId))
				.andExpect(jsonPath("$.placement").doesNotExist());
	}

	// --- 사진별 제품 태그 (D37 개정·ADR-0040) ---

	@Test
	@DisplayName("사진 태그는 전체 교체다 — 빈 배열이 태그 없음이고 상세 응답의 그 사진에 실린다")
	void 사진_태그_전체_교체() throws Exception {
		long productId = seedProduct("기계식 키보드", 120_000);
		long id = createWithProducts(authorId, "타건 글", List.of(productId));
		long imageId = registerImageAndGetId(authorId, id, "desk-feed-images/" + id + "/a.webp");

		replaceImageProducts(authorId, id, imageId, List.of(productId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.productIds.length()").value(1))
				.andExpect(jsonPath("$.productIds[0]").value(productId));

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.images[0].productIds[0]").value(productId));

		// 빈 배열이 "다 뗌"이다 — null과 갈리면 호출부마다 다르게 읽는다.
		replaceImageProducts(authorId, id, imageId, List.of())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.productIds.length()").value(0));
	}

	@Test
	@DisplayName("글에 안 붙은 제품을 사진에만 달면 422다 — 상세가 id만 실어 화면이 이름을 못 찾는다")
	void 글_목록_밖_제품은_422() throws Exception {
		long tagged = seedProduct("모니터암", 89_000);
		long untagged = seedProduct("스피커", 150_000);
		long id = createWithProducts(authorId, "책상 글", List.of(tagged));
		long imageId = registerImageAndGetId(authorId, id, "desk-feed-images/" + id + "/a.webp");

		replaceImageProducts(authorId, id, imageId, List.of(untagged))
				.andExpect(status().isUnprocessableEntity());
	}

	@Test
	@DisplayName("사진을 지우면 그 사진의 태그도 함께 사라진다 — FK CASCADE가 정합을 맡는다")
	void 사진_삭제가_태그를_지운다() throws Exception {
		long productId = seedProduct("데스크 매트", 30_000);
		long id = createWithProducts(authorId, "매트 글", List.of(productId));
		long imageId = registerImageAndGetId(authorId, id, "desk-feed-images/" + id + "/a.webp");
		replaceImageProducts(authorId, id, imageId, List.of(productId)).andExpect(status().isOk());

		mockMvc.perform(delete("/api/v1/desk-feeds/" + id + "/images/" + imageId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject(
				"SELECT count(*) FROM desk_feed_image_product", Integer.class)).isZero();
	}

	private ResultActions replaceImageProducts(Long userId, long deskFeedId, long imageId,
			List<Long> productIds) throws Exception {
		return mockMvc.perform(
				put("/api/v1/desk-feeds/" + deskFeedId + "/images/" + imageId + "/products")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of("productIds", productIds))));
	}

	private long registerImageAndGetId(Long userId, long deskFeedId, String imageKey)
			throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/desk-feeds/" + deskFeedId + "/images")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of("imageKey", imageKey))))
				.andExpect(status().isCreated())
				.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asLong();
	}

	// --- 사용된 제품 태그 (ADR-0034 결정 5) ---

	@Test
	@DisplayName("사용된 제품은 상세에만 카드로 실린다 — 목록 카드에는 없다")
	void 제품_태그_상세에만() throws Exception {
		long productId = seedProduct("27인치 모니터", 350_000);
		long id = createWithProducts(authorId, "제품 태그 글", List.of(productId));
		registerImage(authorId, id, "desk-feed-images/" + id + "/seed.webp");

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usedProducts.length()").value(1))
				.andExpect(jsonPath("$.usedProducts[0].id").value(productId))
				.andExpect(jsonPath("$.usedProducts[0].name").value("27인치 모니터"))
				.andExpect(jsonPath("$.usedProducts[0].priceKrw").value(350_000));

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(jsonPath("$.content[0].usedProducts").doesNotExist());
	}

	@Test
	@DisplayName("수정은 제품 태그를 diff로 교체한다 — 겹치는 제품을 남긴 교체가 유니크에 걸리지 않는다")
	void 제품_태그_diff_교체() throws Exception {
		long kept = seedProduct("남는 제품", 10_000);
		long dropped = seedProduct("빠지는 제품", 20_000);
		long added = seedProduct("들어오는 제품", 30_000);
		long id = createWithProducts(authorId, "제품 태그 글", List.of(kept, dropped));
		String seedKey = "desk-feed-images/" + id + "/seed.webp";
		registerImage(authorId, id, seedKey);

		Map<String, Object> update = new HashMap<>();
		update.put("title", "제품 태그 글");
		update.put("content", contentWith("본문", List.of(seedKey)));
		update.put("hashtags", List.of());
		update.put("placementId", null);
		update.put("productIds", List.of(kept, added));

		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usedProducts.length()").value(2))
				.andExpect(jsonPath("$.usedProducts[*].id",
						org.hamcrest.Matchers.containsInAnyOrder((int) kept, (int) added)));
	}

	@Test
	@DisplayName("소프트 삭제된 제품은 카드에서 빠진다 — 정션 행은 남는다")
	void 삭제된_제품은_숨긴다() throws Exception {
		long alive = seedProduct("살아있는 제품", 10_000);
		long removed = seedProduct("지워질 제품", 20_000);
		long id = createWithProducts(authorId, "제품 태그 글", List.of(alive, removed));
		registerImage(authorId, id, "desk-feed-images/" + id + "/seed.webp");

		jdbc.update("update product set deleted_at = now() where id = ?", removed);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usedProducts.length()").value(1))
				.andExpect(jsonPath("$.usedProducts[0].id").value(alive));
		// 행은 그대로다 — 화면만 숨긴다.
		assertThat(jdbc.queryForObject(
				"select count(*) from desk_feed_product where desk_feed_id = ?", Long.class, id))
				.isEqualTo(2L);
	}

	@Test
	@DisplayName("없는 제품·이미 지워진 제품은 같은 422다 — 존재 여부를 흘리지 않는다")
	void 붙일_수_없는_제품은_422() throws Exception {
		long removed = seedProduct("지워진 제품", 10_000);
		jdbc.update("update product set deleted_at = now() where id = ?", removed);

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyWithProducts("제목", List.of(999_999L))))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_PRODUCT_NOT_TAGGABLE"));

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyWithProducts("제목", List.of(removed))))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_PRODUCT_NOT_TAGGABLE"));
	}

	@Test
	@DisplayName("제품 11개는 400이다 — 상한은 요청 검증이 자른다(태그 ≤5와 같은 자리)")
	void 제품_11개는_400() throws Exception {
		List<Long> ids = new ArrayList<>();
		for (int i = 0; i < 11; i++) {
			ids.add(seedProduct("제품 " + i, 1_000));
		}

		mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyWithProducts("제목", ids)))
				.andExpect(status().isBadRequest());
	}

	// --- 수정·삭제 ---

	@Test
	@DisplayName("수정은 제목·본문·태그·배치 해제의 전체 교체다 — 사진은 건드리지 않는다")
	void 수정_전체_교체() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PUBLIC);
		long id = create(authorId, "원본", List.of("미니멀", "원목"), placementId);
		List<String> keys = registerImages(authorId, id, 2);

		// 본문에서 사진 순서를 뒤집고, 태그는 미니멀만 남기고 화이트를 더하고, 배치를 해제한다.
		String reordered = contentWith("고친 본문", List.of(keys.get(1), keys.get(0)));
		Map<String, Object> update = new HashMap<>();
		update.put("title", "고친 제목");
		update.put("content", reordered);
		update.put("hashtags", List.of("미니멀", "화이트"));
		update.put("placementId", null);

		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("고친 제목"))
				.andExpect(jsonPath("$.content").value(reordered))
				.andExpect(jsonPath("$.hashtags.length()").value(2))
				.andExpect(jsonPath("$.placementId").doesNotExist())
				// 레지스트리는 그대로 3장(시드 1 + 2)이다 — 수정은 사진을 지우지도 넣지도 않는다.
				.andExpect(jsonPath("$.images.length()").value(3));

		// 목록 카드 표지는 본문 첫 이미지를 따라간다 — 대표를 따로 지정하는 자리가 없다.
		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(jsonPath("$.content[0].coverUrl",
						org.hamcrest.Matchers.containsString(keys.get(1))))
				.andExpect(jsonPath("$.content[0].imageCount").value(3));
	}

	@Test
	@DisplayName("수정에서도 본문 이미지 0장은 422다 — 최소 1장이 여기서 선다")
	void 수정_본문_이미지_0장은_422() throws Exception {
		long id = create(authorId, "본문", List.of(), null);

		Map<String, Object> update = new HashMap<>();
		update.put("title", "제목");
		update.put("content", "사진을 다 뺀 본문");
		update.put("hashtags", List.of());
		update.put("placementId", null);

		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.code").value("DESK_FEED_CONTENT_IMAGE_COUNT_INVALID"));
	}

	@Test
	@DisplayName("사진은 등록·삭제 엔드포인트가 관리한다 — 삭제하면 레지스트리에서 빠진다")
	void 사진_등록_삭제() throws Exception {
		long id = createWithoutImages(authorId, "사진 글", List.of(), null);
		List<String> keys = registerImages(authorId, id, 2);

		MvcResult detail = mockMvc.perform(get("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.images.length()").value(2))
				.andReturn();
		long firstImageId = read(detail).get("images").get(0).get("id").asLong();

		// 남의 글 사진은 지울 수 없다.
		mockMvc.perform(delete("/api/v1/desk-feeds/" + id + "/images/" + firstImageId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isForbidden());

		mockMvc.perform(delete("/api/v1/desk-feeds/" + id + "/images/" + firstImageId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId)))
				.andExpect(jsonPath("$.images.length()").value(1))
				.andExpect(jsonPath("$.images[0].imageKey").value(keys.get(1)));

		mockMvc.perform(delete("/api/v1/desk-feeds/" + id + "/images/" + firstImageId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("DESK_FEED_IMAGE_NOT_FOUND"));
	}

	@Test
	@DisplayName("비로그인 상세에 좋아요 여부·본인 판정 필드가 없다 — 세션 딸린 값은 별도 조회다")
	void 비로그인_상세에_세션_필드가_없다() throws Exception {
		long id = create(authorId, "공개 글", List.of(), null);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.liked").doesNotExist())
				.andExpect(jsonPath("$.mine").doesNotExist())
				.andExpect(jsonPath("$.authorId").value(authorId));

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].liked").doesNotExist())
				.andExpect(jsonPath("$.content[0].mine").doesNotExist());
	}

	@Test
	@DisplayName("남의 글 수정·삭제는 403이고 원본이 그대로 남는다")
	void 남의_글은_403() throws Exception {
		long id = create(authorId, "원본 본문", List.of(), null);

		Map<String, Object> update = new HashMap<>();
		update.put("title", "가로챈 제목");
		update.put("content", draftContent("가로챈 본문"));
		update.put("hashtags", List.of());
		update.put("placementId", null);

		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(strangerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("DESK_FEED_NOT_OWNED"));

		mockMvc.perform(delete("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isForbidden());

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(jsonPath("$.content",
						org.hamcrest.Matchers.containsString("원본 본문")));
	}

	// --- presign 상한 ---

	/**
	 * 작성 폼이 본문 사진 <b>전부</b>를 한 번의 presign으로 보내므로, 요청 DTO의 개수 제약이 곧
	 * 한 글의 사진 상한이다. 613이 상한을 10→30으로 올릴 때 그 {@code @Size}만 10에 남아 11장짜리
	 * 글이 400으로 죽었고, 본문 장수 테스트(31장 422)는 다른 경로라 이를 못 잡았다(DERO-625).
	 */
	@Test
	@DisplayName("presign은 30장까지 한 번에 받는다 — 11장이 400이 아니다")
	void presign은_30장까지_받는다() throws Exception {
		long id = createWithoutImages(authorId, "여러 장", List.of(), null);

		mockMvc.perform(post("/api/v1/desk-feeds/" + id + "/images/upload-urls")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of(
								"contentTypes", java.util.Collections.nCopies(30, "image/webp")))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(30));
	}

	@Test
	@DisplayName("presign 31장은 400이다 — 상한 밖은 형식 단계에서 막는다")
	void presign_31장은_400() throws Exception {
		long id = createWithoutImages(authorId, "너무 많음", List.of(), null);

		mockMvc.perform(post("/api/v1/desk-feeds/" + id + "/images/upload-urls")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of(
								"contentTypes", java.util.Collections.nCopies(31, "image/webp")))))
				.andExpect(status().isBadRequest());
	}

	// --- 사진 0장 노출 게이트 ---

	@Test
	@DisplayName("사진 0장 글은 목록에서 빠지고, 등록되는 순간 나타난다")
	void 사진_0장은_목록에서_빠진다() throws Exception {
		long id = createWithoutImages(authorId, "업로드 중", List.of(), null);

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0))
				.andExpect(jsonPath("$.totalCount").value(0));

		registerImage(authorId, id, "desk-feed-images/" + id + "/late.webp");
		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(id));
	}

	@Test
	@DisplayName("사진 0장 글 상세는 비작성자에게 404다 — 존재를 흘리지 않는다")
	void 사진_0장_상세는_비작성자_404() throws Exception {
		long id = createWithoutImages(authorId, "업로드 중", List.of(), null);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("DESK_FEED_NOT_FOUND"));
		mockMvc.perform(get("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("DESK_FEED_NOT_FOUND"));
	}

	@Test
	@DisplayName("사진 0장 글 상세를 작성자는 본다 — 이어서 등록할 수 있어야 한다")
	void 사진_0장_상세를_작성자는_본다() throws Exception {
		long id = createWithoutImages(authorId, "업로드 중", List.of(), null);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.images.length()").value(0));
	}

	@Test
	@DisplayName("소프트 삭제된 글은 목록에도 상세에도 없다")
	void 삭제된_글은_안_보인다() throws Exception {
		long id = create(authorId, "지울 글", List.of(), null);
		mockMvc.perform(delete("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(jsonPath("$.content.length()").value(0));
		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("DESK_FEED_NOT_FOUND"));
	}

	// --- 도우미 ---

	/**
	 * 글 + 시드 표지 사진 1장. 사진 0장 글은 노출 게이트에 걸려 목록·상세에 안 보이므로, 노출을
	 * 전제로 하는 테스트는 전부 이 헬퍼를 쓴다. 0장 상태 자체는 전용 테스트가 직접 만든다.
	 *
	 * <p>{@code text}는 제목과 본문에 같은 값을 넣는다 — 이 헬퍼를 쓰는 테스트는 둘을 구분해 보지
	 * 않고, 구분이 필요한 테스트({@link #작성_201}·{@link #수정_전체_교체})는 본문을 직접 만든다.
	 *
	 * <p>실제 작성 흐름을 그대로 밟는다 — presign이 글 id를 요구해서 ①미리보기 주소를 문 본문으로
	 * 글을 만들고 ②사진을 등록한 뒤 ③본문의 주소를 key로 바꾸는 {@code PUT}을 친다
	 * ({@code DeskFeedUploadForm}과 같은 3단계).
	 */
	private long create(Long userId, String text, List<String> hashtags, Long placementId)
			throws Exception {
		long id = createWithoutImages(userId, text, hashtags, placementId);
		String key = "desk-feed-images/" + id + "/seed.webp";
		registerImage(userId, id, key);

		Map<String, Object> update = new HashMap<>();
		update.put("title", text);
		update.put("content", contentWith(text, List.of(key)));
		update.put("hashtags", hashtags);
		update.put("placementId", placementId);
		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isOk());
		return id;
	}

	private long createWithoutImages(Long userId, String text, List<String> hashtags,
			Long placementId) throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(text, draftContent(text), hashtags, placementId)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	/** 작성 시점의 본문 — 아직 key가 없어 브라우저 미리보기 주소를 문다(장수만 성립한다). */
	private String draftContent(String text) {
		return contentWith(text, List.of("blob:draft-1"));
	}

	/** 본문 + 인라인 이미지 마크다운. 배열 순서가 곧 화면 순서이고 첫 장이 목록 카드 표지다. */
	private String contentWith(String text, List<String> imageKeys) {
		StringBuilder content = new StringBuilder(text);
		for (String imageKey : imageKeys) {
			content.append("\n\n![](").append(imageKey).append(')');
		}
		return content.toString();
	}

	private void registerImage(Long userId, long deskFeedId, String imageKey) throws Exception {
		mockMvc.perform(post("/api/v1/desk-feeds/" + deskFeedId + "/images")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of("imageKey", imageKey))))
				.andExpect(status().isCreated());
	}

	/** {@code Map.of}는 null 값을 거부한다 — 누락 검증과 placementId 때문에 HashMap으로 조립한다. */
	private String body(String title, String content, List<String> hashtags, Long placementId)
			throws Exception {
		Map<String, Object> body = new HashMap<>();
		body.put("title", title);
		body.put("content", content);
		body.put("hashtags", hashtags);
		body.put("placementId", placementId);
		return objectMapper.writeValueAsString(body);
	}

	private String bodyWithProducts(String text, List<Long> productIds) throws Exception {
		Map<String, Object> body = new HashMap<>();
		body.put("title", text);
		body.put("content", draftContent(text));
		body.put("hashtags", List.of());
		body.put("placementId", null);
		body.put("productIds", productIds);
		return objectMapper.writeValueAsString(body);
	}

	/** 사진 없는 글 + 제품 태그. 사진은 호출부가 필요할 때 따로 등록한다. */
	private long createWithProducts(Long userId, String text, List<Long> productIds)
			throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(bodyWithProducts(text, productIds)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	/**
	 * 제품 한 건. 규격 서브타입 중 가장 가벼운 {@code Prop}을 쓴다 — 데스크피드는 제품의 규격을
	 * 보지 않고 id·이름·가격·대표 이미지만 읽는다({@code CartItemControllerTest}와 같은 시드).
	 */
	private long seedProduct(String name, int priceKrw) {
		if (propCategory == null) {
			propCategory = categories.save(Category.createRoot("소품", null, 1));
		}
		return products.save(Prop.create(ProductSource.CATALOG, null, null, propCategory,
				name, null, priceKrw, null, 100, 100, 100, 1_000, false, MountSurface.TOP))
				.getId();
	}

	/** presign 1단계 → 2단계를 실제 API로 밟아 사진 {@code count}장을 등록한다. */
	private List<String> registerImages(Long userId, long deskFeedId, int count)
			throws Exception {
		MvcResult presigned = mockMvc.perform(
						post("/api/v1/desk-feeds/" + deskFeedId + "/images/upload-urls")
								.header("Authorization", bearer(userId))
								.contentType(MediaType.APPLICATION_JSON)
								.content(objectMapper.writeValueAsString(Map.of(
										"contentTypes", java.util.Collections.nCopies(count, "image/webp")))))
				.andExpect(status().isOk())
				.andReturn();

		List<String> keys = new ArrayList<>();
		for (JsonNode item : read(presigned).get("items")) {
			String key = item.get("imageKey").asText();
			registerImage(userId, deskFeedId, key);
			keys.add(key);
		}
		return keys;
	}

	/** 배치 한 건. {@code publish_status}는 API로 정할 수 없어(서버만 정한다) JDBC로 바꾼다. */
	private long seedPlacement(Long userId, PublishStatus publishStatus) {
		Placement placement =
				placements.save(Placement.create(users.getReferenceById(userId), "배치", null, null));
		jdbc.update("update placement set publish_status = ? where id = ?",
				publishStatus.name(), placement.getId());
		return placement.getId();
	}

	/** 페이지 크기 3으로 끝까지 순회하며 만난 id를 모은다. 중복은 그대로 남아 단언에 걸린다. */
	private List<Long> walkAllPages() throws Exception {
		List<Long> seen = new ArrayList<>();
		String cursor = null;
		for (int page = 0; page < 10; page++) {
			MvcResult result = mockMvc.perform(cursor == null
							? get("/api/v1/desk-feeds").param("size", "3")
							: get("/api/v1/desk-feeds").param("size", "3").param("cursor", cursor))
					.andExpect(status().isOk())
					.andReturn();
			seen.addAll(idsOf(result));
			JsonNode body = read(result);
			if (!body.get("hasNext").asBoolean()) {
				return seen;
			}
			cursor = body.get("nextCursor").asText();
		}
		throw new AssertionError("커서가 10페이지 안에 끝나지 않았다 — 순회가 멈추지 않는다");
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
