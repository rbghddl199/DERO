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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code /posts} — 목록·작성·상세·수정·삭제를 <b>HTTP 시임</b>으로 검증한다
 * (DERO-345, ADR-0013).
 *
 * <p>못 박는 것 넷이다. ① <b>비로그인도 목록·상세를 200으로 본다</b>(🔓). ② <b>남의 글 수정·삭제는
 * 403</b>이다(404가 아니다 — 본문이 이미 공개돼 있다). ③ <b>본문 {@code [[placement:ID]]} 토큰은
 * 본인 소유 + PUBLIC 배치만 통과한다</b>(ADR-0013 결정 3) — 남의 배치·비공개 배치·없는 배치는 전부
 * 400이고 <b>자동 공개도 하지 않는다</b>. ④ 커서를 끝까지 순회해도 중복·누락이 없다.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PlacementListControllerTest}와 같다 — MockMvc 요청이 테스트
 * 트랜잭션에 참여하면 실패 경로가 rollback-only를 만들어 뒤의 검증이 통째로 죽는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PostControllerTest extends AbstractPostgresIntegrationTest {

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
	private Long strangerId;

	/** {@link #seedPlacement}가 박아 넣는 결정론적 양수 id — 사유는 그 메서드 Javadoc. */
	private long nextPlacementId = 1_000L;

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
				TRUNCATE TABLE post_hashtag, post_image, post_like, post_comment, post, hashtag,
					placed_item, placement_desk, placement, "user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 목록 ---

	@Test
	@DisplayName("비로그인 목록은 200이다 — 게시글엔 배치 같은 게시 상태가 없어 전부 보인다")
	void 비로그인_목록은_200() throws Exception {
		long id = create(authorId, "제목", "본문", List.of());

		mockMvc.perform(get("/api/v1/posts"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(id))
				.andExpect(jsonPath("$.content[0].nickname").value("글쓴이"))
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("소프트 삭제된 글은 목록에도 상세에도 없다")
	void 삭제된_글은_안_보인다() throws Exception {
		long id = create(authorId, "지울 글", "본문", List.of());
		mockMvc.perform(delete("/api/v1/posts/" + id).header("Authorization", bearer(authorId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/posts"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0));
		mockMvc.perform(get("/api/v1/posts/" + id))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("POST_NOT_FOUND"));
	}

	@Test
	@DisplayName("?hashtag는 그 태그가 붙은 글만 돌려준다 — 태그가 여러 개여도 중복으로 안 실린다")
	void 해시태그_필터() throws Exception {
		long tagged = create(authorId, "태그 글", "본문", List.of("미니멀", "우드톤"));
		create(authorId, "무태그 글", "본문", List.of());

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/posts").param("hashtag", "미니멀"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(1))
				.andReturn());

		assertThat(picked).containsExactly(tagged);
	}

	@Test
	@DisplayName("?owner=me는 본인 글만 돌려준다")
	void owner_me() throws Exception {
		long mine = create(authorId, "내 글", "본문", List.of());
		create(strangerId, "남의 글", "본문", List.of());

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/posts")
						.param("owner", "me")
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(picked).containsExactly(mine);
	}

	@Test
	@DisplayName("비로그인 ?owner=me는 400이다 — 빈 결과로 뭉개면 '내 글이 없음'과 구분이 안 된다")
	void 비로그인_owner_me는_400() throws Exception {
		mockMvc.perform(get("/api/v1/posts").param("owner", "me"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("커서를 끝까지 순회해도 중복·누락이 없다")
	void 커서_해피패스() throws Exception {
		List<Long> seeded = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			seeded.add(create(authorId, "글 " + i, "본문", List.of()));
		}

		assertThat(walkAllPages()).containsExactlyInAnyOrderElementsOf(seeded);
	}

	@Test
	@DisplayName("마지막 페이지는 hasNext=false·nextCursor=null이다")
	void 마지막_페이지() throws Exception {
		create(authorId, "하나", "본문", List.of());

		mockMvc.perform(get("/api/v1/posts").param("size", "10"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.hasNext").value(false))
				.andExpect(jsonPath("$.nextCursor").doesNotExist());
	}

	// --- 작성·상세 ---

	@Test
	@DisplayName("작성은 201 + Location이고 상세가 제목·본문·태그를 그대로 돌려준다")
	void 작성_201() throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("첫 글", "이렇게 꾸몄어요", List.of("미니멀"))))
				.andExpect(status().isCreated())
				.andExpect(header().exists("Location"))
				.andExpect(jsonPath("$.title").value("첫 글"))
				.andExpect(jsonPath("$.hashtags[0]").value("미니멀"))
				.andExpect(jsonPath("$.likeCount").value(0))
				.andExpect(jsonPath("$.commentCount").value(0))
				.andReturn();

		long id = read(result).get("id").asLong();
		assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/v1/posts/" + id);
		mockMvc.perform(get("/api/v1/posts/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content").value("이렇게 꾸몄어요"))
				.andExpect(jsonPath("$.images.length()").value(0));
	}

	@Test
	@DisplayName("비로그인 작성은 401이다")
	void 비로그인_작성은_401() throws Exception {
		mockMvc.perform(post("/api/v1/posts")
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "본문", List.of())))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("제목이 비면 400이다")
	void 빈_제목은_400() throws Exception {
		mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("  ", "본문", List.of())))
				.andExpect(status().isBadRequest());
	}

	// --- 수정·삭제 소유권 ---

	@Test
	@DisplayName("남의 글 수정은 403이고 원본이 그대로 남는다")
	void 남의_글_수정은_403() throws Exception {
		long id = create(authorId, "원본 제목", "원본 본문", List.of());

		mockMvc.perform(put("/api/v1/posts/" + id)
						.header("Authorization", bearer(strangerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("가로챈 제목", "가로챈 본문", List.of())))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("POST_NOT_OWNED"));

		mockMvc.perform(get("/api/v1/posts/" + id))
				.andExpect(jsonPath("$.title").value("원본 제목"));
	}

	@Test
	@DisplayName("남의 글 삭제는 403이고 글이 살아남는다")
	void 남의_글_삭제는_403() throws Exception {
		long id = create(authorId, "제목", "본문", List.of());

		mockMvc.perform(delete("/api/v1/posts/" + id).header("Authorization", bearer(strangerId)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("POST_NOT_OWNED"));

		mockMvc.perform(get("/api/v1/posts/" + id)).andExpect(status().isOk());
	}

	@Test
	@DisplayName("본인 수정은 200이고 태그가 통째로 교체된다 — 겹치는 교체도 유니크에 안 걸린다")
	void 수정_200() throws Exception {
		long id = create(authorId, "제목", "본문", List.of("미니멀", "우드톤"));

		mockMvc.perform(put("/api/v1/posts/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						// 미니멀은 남기고 화이트를 더한다 — clear+addAll이면 여기서 중복키로 죽는다.
						.content(saveBody("고친 제목", "고친 본문", List.of("미니멀", "화이트"))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.title").value("고친 제목"))
				.andExpect(jsonPath("$.hashtags.length()").value(2));

		mockMvc.perform(get("/api/v1/posts/" + id))
				.andExpect(jsonPath("$.content").value("고친 본문"));
	}

	// --- 본문 배치 토큰 게이트 (ADR-0013 결정 3) ---

	@Test
	@DisplayName("본인의 공개 배치 토큰은 통과한다")
	void 본인_공개_배치_토큰_통과() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PUBLIC);

		mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "보세요 [[placement:" + placementId + "]]", List.of())))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.content")
						.value("보세요 [[placement:" + placementId + "]]"));
	}

	@Test
	@DisplayName("내 비공개 배치를 삽입하면 400이고 배치는 자동 공개되지 않는다")
	void 내_비공개_배치_토큰은_400() throws Exception {
		long placementId = seedPlacement(authorId, PublishStatus.PRIVATE);

		mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "[[placement:" + placementId + "]]", List.of())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_PLACEMENT_NOT_EMBEDDABLE"));

		assertThat(jdbc.queryForObject(
				"select publish_status from placement where id = ?", String.class, placementId))
				.isEqualTo("PRIVATE");
		mockMvc.perform(get("/api/v1/posts"))
				.andExpect(jsonPath("$.content.length()").value(0));
	}

	@Test
	@DisplayName("남의 공개 배치를 삽입해도 400이다 — 본인 소유가 아니다")
	void 남의_공개_배치_토큰은_400() throws Exception {
		long placementId = seedPlacement(strangerId, PublishStatus.PUBLIC);

		mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "[[placement:" + placementId + "]]", List.of())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_PLACEMENT_NOT_EMBEDDABLE"));
	}

	@Test
	@DisplayName("없는 배치 id 토큰도 같은 400이다 — 존재 여부를 흘리지 않는다")
	void 없는_배치_토큰은_400() throws Exception {
		mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "[[placement:999999]]", List.of())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_PLACEMENT_NOT_EMBEDDABLE"));
	}

	@Test
	@DisplayName("수정에서 비공개 배치를 끼워 넣어도 400이고 본문이 안 바뀐다")
	void 수정_토큰_게이트() throws Exception {
		long id = create(authorId, "제목", "원본 본문", List.of());
		long placementId = seedPlacement(authorId, PublishStatus.PRIVATE);

		mockMvc.perform(put("/api/v1/posts/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody("제목", "[[placement:" + placementId + "]]", List.of())))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_PLACEMENT_NOT_EMBEDDABLE"));

		mockMvc.perform(get("/api/v1/posts/" + id))
				.andExpect(jsonPath("$.content").value("원본 본문"));
	}

	// --- 도우미 ---

	private long create(Long userId, String title, String content, List<String> hashtags)
			throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(saveBody(title, content, hashtags)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	private String saveBody(String title, String content, List<String> hashtags) throws Exception {
		return objectMapper.writeValueAsString(
				java.util.Map.of("title", title, "content", content, "hashtags", hashtags));
	}

	/**
	 * 배치 한 건을 심는다. {@code publish_status}는 API로 정할 수 없어(서버만 정한다) JDBC로 넣는다.
	 *
	 * <p><b>id를 양수로 다시 박는다.</b> 다른 테스트 클래스가 {@code TRUNCATE … RESTART IDENTITY}로
	 * {@code placement_id_seq}를 1로 되돌려 놓으면, Hibernate의 pooled optimizer
	 * ({@code allocationSize = 50})가 {@code nextval=1}에서 {@code -48 … 1} 블록을 만들어 <b>음수
	 * id</b>를 채번한다(실측: -48·-47·-46). 이 테스트는 그 id를 본문 토큰 문자열
	 * {@code [[placement:ID]]}에 넣는데 파서가 {@code \d+}만 받으므로 음수 id는 토큰으로 인식되지
	 * 않아 <b>게이트가 통째로 안 돌고 테스트가 조용히 통과한다</b> — 프로덕션엔 없는 상황이라
	 * 파서를 넓히지 않고 테스트 데이터를 현실에 맞춘다.
	 */
	private long seedPlacement(Long userId, PublishStatus publishStatus) {
		Placement placement =
				placements.save(Placement.create(users.getReferenceById(userId), "배치", null, null));
		long id = nextPlacementId++;
		// create()가 시드한 벽 3행이 옛 id를 물고 있어 id 재작성이 FK에 걸린다 — 이 테스트는 벽을
		// 안 보므로 지운다(상세는 벽 행이 없어도 3면을 합성한다).
		jdbc.update("delete from placement_wall where placement_id = ?", placement.getId());
		jdbc.update("update placement set id = ?, publish_status = ? where id = ?", id,
				publishStatus.name(), placement.getId());
		return id;
	}

	/** 페이지 크기 3으로 끝까지 순회하며 만난 id를 모은다. 중복은 그대로 남아 단언에 걸린다. */
	private List<Long> walkAllPages() throws Exception {
		List<Long> seen = new ArrayList<>();
		String cursor = null;
		for (int page = 0; page < 10; page++) {
			MvcResult result = mockMvc.perform(cursor == null
							? get("/api/v1/posts").param("size", "3")
							: get("/api/v1/posts").param("size", "3").param("cursor", cursor))
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
