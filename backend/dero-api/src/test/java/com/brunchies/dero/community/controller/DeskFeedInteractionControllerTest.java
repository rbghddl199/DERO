package com.brunchies.dero.community.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 데스크피드 사진 presign·좋아요·댓글의 HTTP 시임 검증(DERO-561, api-spec.md §6-보).
 *
 * <p>못 박는 것 넷이다. ① <b>댓글이 실영속이다</b> — 마커 시절 세션 메모리 댓글(새로고침 증발,
 * ADR-0033 결함 4)의 처방이므로 작성 후 다시 읽어 남아 있는지를 본다. ② 사진 key는 <b>이 글의
 * 접두사만</b> 등록되고 상한 30장이 WAS에서 선다. ③ <b>표지를 옮기면 이전 표지가 내려가고 삭제는
 * 204다</b>(D32 개정·ADR-0034 예정 — {@code PostImageController}와 같은 4개 계약). ④ 좋아요는
 * post와 같은 3동사 멱등 계약이다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class DeskFeedInteractionControllerTest extends AbstractPostgresIntegrationTest {

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

	private Long authorId;
	private Long strangerId;
	private long deskFeedId;

	@BeforeEach
	void setUp() throws Exception {
		authorId = users.save(User.create("author@example.com", Provider.KAKAO, "p-author", "글쓴이"))
				.getId();
		strangerId =
				users.save(User.create("other@example.com", Provider.KAKAO, "p-other", "남")).getId();
		deskFeedId = createFeed(authorId);
	}

	/** 테스트 트랜잭션이 없어 각 요청이 커밋된다 — 다음 테스트에 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE desk_feed_hashtag, desk_feed_image, desk_feed_like,
					desk_feed_comment, desk_feed, hashtag, "user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 사진 presign 2단계 ---

	@Test
	@DisplayName("1단계는 200이고 key 접두사가 글에 묶인다 — 2단계 등록까지 왕복한다")
	void presign_왕복() throws Exception {
		MvcResult presigned = mockMvc.perform(uploadUrls(authorId, List.of("image/webp")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].uploadUrl").isNotEmpty())
				.andReturn();
		String key = read(presigned).get("items").get(0).get("imageKey").asText();
		assertThat(key).startsWith("desk-feed-images/" + deskFeedId + "/");

		mockMvc.perform(register(authorId, key))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.imageKey").value(key));

		// 본문의 미리보기 주소를 key로 바꾸면(작성 3단계의 마지막) 그 첫 장이 목록 카드 표지가 된다.
		Map<String, Object> update = new HashMap<>();
		update.put("title", "제목");
		update.put("content", "본문\n\n![](" + key + ")");
		update.put("hashtags", List.of());
		update.put("placementId", null);
		mockMvc.perform(put("/api/v1/desk-feeds/" + deskFeedId)
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(update)))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/v1/desk-feeds"))
				.andExpect(jsonPath("$.content[0].coverUrl").isNotEmpty())
				.andExpect(jsonPath("$.content[0].imageCount").value(1));
	}

	@Test
	@DisplayName("남의 글 presign은 403, 지원 밖 MIME은 400, 남의 접두사 key 등록은 400이다")
	void presign_거절() throws Exception {
		mockMvc.perform(uploadUrls(strangerId, List.of("image/webp")))
				.andExpect(status().isForbidden());

		mockMvc.perform(uploadUrls(authorId, List.of("application/pdf")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("DESK_FEED_UNSUPPORTED_IMAGE_TYPE"));

		mockMvc.perform(register(authorId, "post-images/1/stolen.webp"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("DESK_FEED_INVALID_IMAGE_KEY"));
	}

	@Test
	@DisplayName("레지스트리 31장째 등록은 400이다 — 행 개수 상한은 여기가 유일한 강제 지점이다")
	void 사진_상한() throws Exception {
		String prefix = "desk-feed-images/" + deskFeedId + "/";
		for (int index = 0; index < 30; index++) {
			mockMvc.perform(register(authorId, prefix + index + ".webp"))
					.andExpect(status().isCreated());
		}
		mockMvc.perform(register(authorId, prefix + "over.webp"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("DESK_FEED_IMAGE_LIMIT_EXCEEDED"));
		// 1단계도 "이미 있는 장수 + 요청 수"로 판단한다.
		mockMvc.perform(uploadUrls(authorId, List.of("image/webp")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("DESK_FEED_IMAGE_LIMIT_EXCEEDED"));
	}

	// --- 좋아요 ---

	@Test
	@DisplayName("좋아요 3동사 — PUT은 멱등, DELETE 후 카운트가 돌아오고 GET이 상태를 답한다")
	void 좋아요_3동사() throws Exception {
		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId + "/like"))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(put("/api/v1/desk-feeds/" + deskFeedId + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNoContent());
		// 같은 사용자가 다시 눌러도 카운트는 1이다(멱등).
		mockMvc.perform(put("/api/v1/desk-feeds/" + deskFeedId + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.liked").value(true))
				.andExpect(jsonPath("$.likeCount").value(1));

		mockMvc.perform(delete("/api/v1/desk-feeds/" + deskFeedId + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNoContent());
		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId + "/like")
						.header("Authorization", bearer(strangerId)))
				.andExpect(jsonPath("$.liked").value(false))
				.andExpect(jsonPath("$.likeCount").value(0));
	}

	// --- 댓글 (실영속 — ADR-0033 결함 4의 처방) ---

	@Test
	@DisplayName("댓글은 영속이다 — 작성 후 목록을 다시 읽어도 남아 있고 비로그인도 목록을 본다")
	void 댓글_실영속() throws Exception {
		mockMvc.perform(post("/api/v1/desk-feeds/" + deskFeedId + "/comments")
						.header("Authorization", bearer(strangerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of("content", "책상 멋져요"))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.nickname").value("남"));

		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId + "/comments"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].content").value("책상 멋져요"))
				.andExpect(jsonPath("$.totalCount").value(1));

		// 상세의 commentCount에도 실린다 — 이 글은 사진 0장이라(노출 게이트) 작성자로 조회한다.
		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId)
						.header("Authorization", bearer(authorId)))
				.andExpect(jsonPath("$.commentCount").value(1));
	}

	@Test
	@DisplayName("남의 댓글 삭제는 403, 본인 삭제는 204이고 목록에서 사라진다")
	void 댓글_삭제_소유권() throws Exception {
		MvcResult created = mockMvc.perform(
						post("/api/v1/desk-feeds/" + deskFeedId + "/comments")
								.header("Authorization", bearer(strangerId))
								.contentType(MediaType.APPLICATION_JSON)
								.content(objectMapper.writeValueAsString(Map.of("content", "한마디"))))
				.andExpect(status().isCreated())
				.andReturn();
		long commentId = read(created).get("id").asLong();

		mockMvc.perform(delete(
						"/api/v1/desk-feeds/" + deskFeedId + "/comments/" + commentId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("COMMENT_NOT_OWNED"));

		mockMvc.perform(delete(
						"/api/v1/desk-feeds/" + deskFeedId + "/comments/" + commentId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/desk-feeds/" + deskFeedId + "/comments"))
				.andExpect(jsonPath("$.content.length()").value(0));
	}

	// --- 도우미 ---

	private long createFeed(Long userId) throws Exception {
		Map<String, Object> body = new HashMap<>();
		body.put("title", "제목");
		// 작성 시점의 본문은 아직 key가 없어 브라우저 미리보기 주소를 문다(장수만 성립한다).
		body.put("content", "본문\n\n![](blob:draft-1)");
		body.put("hashtags", List.of());
		body.put("placementId", null);
		MvcResult result = mockMvc.perform(post("/api/v1/desk-feeds")
						.header("Authorization", bearer(userId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(body)))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder uploadUrls(
			Long userId, List<String> contentTypes) throws Exception {
		return post("/api/v1/desk-feeds/" + deskFeedId + "/images/upload-urls")
				.header("Authorization", bearer(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(Map.of("contentTypes", contentTypes)));
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder register(
			Long userId, String imageKey) throws Exception {
		return post("/api/v1/desk-feeds/" + deskFeedId + "/images")
				.header("Authorization", bearer(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(Map.of("imageKey", imageKey)));
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
