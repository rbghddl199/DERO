package com.brunchies.dero.community.controller;

import static org.hamcrest.Matchers.containsString;
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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 멘션 해석을 <b>HTTP 시임</b>으로 검증한다(DERO-603, D35·ADR-0038).
 *
 * <p>못 박는 것 넷이다. ① <b>본문·댓글의 {@code [[user:ID]]}가 응답의 {@code mentions}에 현재
 * 닉네임으로 풀려 나온다</b>(결정 2 — 프론트는 조회 없이 치환만 한다). ② <b>닉네임을 바꿔도 같은
 * 사람을 가리킨다</b> — 생 텍스트 저장을 부결한 이유가 이것이다(부결 1). ③ <b>탈퇴·부재 사용자는
 * 목록에서 빠진다</b> — 화면 폴백("@알 수 없음")이 "목록에 없으면" 한 조건으로 서게 하는 계약이다
 * (결정 4). ④ <b>목록 카드에도 실린다</b> — 카드가 {@code content}로 발췌를 그려서다.
 *
 * <p>파서 내부 구조는 검증하지 않는다(스펙 Testing Decisions) — 여기가 보는 것은 저장된 텍스트가
 * 어떤 응답이 되는가뿐이다. 테스트 트랜잭션을 끄는 이유는 {@code DeskFeedControllerTest}와 같다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DeskFeedMentionControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	/** Boot 4는 Jackson 3으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다 — 직접 만든다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	/**
	 * 멘션 대상의 id를 <b>직접 박는다</b> — 이 클래스는 유일하게 <b>id가 본문 문자열 안으로 들어가는</b>
	 * 테스트라, 시퀀스가 발급하는 값에 기대면 안 된다. 앞서 도는 클래스가
	 * {@code TRUNCATE ... RESTART IDENTITY}로 {@code user_id_seq}를 1로 되돌려 두면 Hibernate pooled
	 * optimizer({@code allocationSize = 50})가 <b>음수 id</b>를 발급하고(2026-08-11 실측: -47·-46),
	 * 프로덕션에 존재할 수 없는 값이라 토큰 파서가 정당하게 거부한다 — 그래서 단독 실행은 통과하고
	 * 전체 실행만 깨진다. 시퀀스가 절대 닿지 않는 값이라 충돌하지 않는다.
	 */
	private static final long MENTIONED_ID = 900_001L;

	private Long authorId;
	private Long mentionedId;

	@BeforeEach
	void setUp() {
		authorId = users.save(User.create("author@example.com", Provider.KAKAO, "p-author", "글쓴이"))
				.getId();
		jdbc.update("""
				INSERT INTO "user" (id, email, provider, provider_id, nickname, status, role,
					created_at)
				VALUES (?, 'desk@example.com', 'KAKAO', 'p-desk', '책상주인', 'ACTIVE', 'USER', now())
				""", MENTIONED_ID);
		mentionedId = MENTIONED_ID;
	}

	/** {@code RESTART IDENTITY}를 쓰지 않는 이유는 {@link #MENTIONED_ID}가 설명한다 — 뒤에 도는 클래스에 같은 함정을 넘기지 않는다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE desk_feed_hashtag, desk_feed_image, desk_feed_like,
					desk_feed_comment, desk_feed_product, desk_feed, hashtag, "user" CASCADE
				""");
	}

	@Test
	@DisplayName("본문의 [[user:ID]]는 상세 응답 mentions에 현재 닉네임으로 실린다")
	void 상세_멘션_해석() throws Exception {
		long id = create("이건 [[user:" + mentionedId + "]] 의 책상입니다");

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mentions.length()").value(1))
				.andExpect(jsonPath("$.mentions[0].userId").value(mentionedId))
				.andExpect(jsonPath("$.mentions[0].nickname").value("책상주인"));
	}

	@Test
	@DisplayName("멘션된 사람이 닉네임을 바꾸면 기존 글의 멘션도 새 닉네임으로 해석된다")
	void 닉변_후에도_같은_사람() throws Exception {
		long id = create("이건 [[user:" + mentionedId + "]] 의 책상입니다");

		changeNickname(mentionedId, "책상장인");

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content")
						.value(containsString("[[user:" + mentionedId + "]]")))
				.andExpect(jsonPath("$.mentions[0].nickname").value("책상장인"));
	}

	@Test
	@DisplayName("탈퇴한 사용자 멘션은 mentions에서 빠진다 — 화면이 '@알 수 없음'을 그린다")
	void 탈퇴자는_빠진다() throws Exception {
		long id = create("이건 [[user:" + mentionedId + "]] 의 책상입니다");

		withdraw(mentionedId);

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mentions.length()").value(0));
	}

	@Test
	@DisplayName("없는 userId를 가리키는 토큰도 200이고 mentions에서 빠진다 — 화면이 깨지지 않는다")
	void 부재_사용자는_빠진다() throws Exception {
		long id = create("이건 [[user:999999]] 의 책상입니다");

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mentions.length()").value(0));
	}

	@Test
	@DisplayName("토큰이 없는 본문은 빈 mentions다 — 토큰 아닌 @문자열은 건드리지 않는다")
	void 토큰_없으면_빈_목록() throws Exception {
		long id = create("연락은 dero@example.com 으로 주세요");

		mockMvc.perform(get("/api/v1/desk-feeds/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.mentions.length()").value(0));
	}

	@Test
	@DisplayName("목록 카드에도 mentions가 실린다 — 카드 발췌가 본문으로 그려져서다")
	void 목록에도_실린다() throws Exception {
		create("이건 [[user:" + mentionedId + "]] 의 책상입니다");

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].mentions[0].nickname").value("책상주인"));
	}

	@Test
	@DisplayName("댓글의 멘션도 같은 규칙으로 풀린다 — 작성 응답과 목록 응답 둘 다")
	void 댓글_멘션() throws Exception {
		long id = create("내 책상 사진입니다");

		mockMvc.perform(post("/api/v1/desk-feeds/" + id + "/comments")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(
								Map.of("content", "[[user:" + mentionedId + "]] 님 책상 맞죠?"))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.mentions[0].nickname").value("책상주인"));

		mockMvc.perform(get("/api/v1/desk-feeds/" + id + "/comments"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].mentions[0].userId").value(mentionedId));
	}

	// --- 픽스처 ---

	/** 사진 1장짜리 글 하나 — 본문 이미지 1~30장 검증(ADR-0037 결정 1)을 통과해야 저장된다. */
	private long create(String text) throws Exception {
		MvcResult created = mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(text, text + "\n\n![](blob:draft-1)", null)))
				.andExpect(status().isCreated())
				.andReturn();
		long id = read(created).get("id").asLong();

		String key = "desk-feed-images/" + id + "/seed.webp";
		mockMvc.perform(post("/api/v1/desk-feeds/" + id + "/images")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of("imageKey", key))))
				.andExpect(status().isCreated());

		mockMvc.perform(put("/api/v1/desk-feeds/" + id)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(text, text + "\n\n![](" + key + ")", null)))
				.andExpect(status().isOk());
		return id;
	}

	/** {@code Map.of}는 null 값을 거부한다 — placementId 때문에 HashMap으로 조립한다. */
	private String body(String title, String content, Long placementId) throws Exception {
		Map<String, Object> body = new HashMap<>();
		body.put("title", title);
		body.put("content", content);
		body.put("hashtags", List.of());
		body.put("placementId", placementId);
		return objectMapper.writeValueAsString(body);
	}

	/** 도메인 메서드로 바꾼다 — 더티 체킹이 커밋 시 UPDATE를 낸다(테스트 트랜잭션이 없으므로 직접 연다). */
	private void changeNickname(Long userId, String nickname) {
		new TransactionTemplate(transactionManager).executeWithoutResult(
				status -> users.findById(userId).orElseThrow().changeNickname(nickname));
	}

	private void withdraw(Long userId) {
		new TransactionTemplate(transactionManager).executeWithoutResult(
				status -> users.findById(userId).orElseThrow().withdraw());
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
