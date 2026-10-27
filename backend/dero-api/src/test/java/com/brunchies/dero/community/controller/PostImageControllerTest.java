package com.brunchies.dero.community.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import java.util.Collections;
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
 * {@code /posts/{id}/images} — presign 2단계와 상한 20장·대표 1장을 HTTP 시임으로 검증한다
 * (ADR-0013 결정 5·8).
 *
 * <p>못 박는 것 셋. ① 1단계는 <b>200</b>이다(저장하는 게 없다). ② <b>21장째가 400</b>이다 — 행 개수
 * 조건이라 인덱스로 표현할 수 없어 WAS만이 막는 자리다. ③ 대표를 옮기면 <b>이전 대표가 내려간다</b>
 * — 부분 유니크가 두 번째 {@code true}를 거부하므로 순서를 틀리면 500이 된다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PostImageControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	private final ObjectMapper objectMapper = new ObjectMapper();

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private JdbcTemplate jdbc;

	private Long authorId;
	private Long strangerId;
	private long postId;

	@BeforeEach
	void setUp() throws Exception {
		authorId = users.save(User.create("img@example.com", Provider.KAKAO, "p-img", "글쓴이"))
				.getId();
		strangerId =
				users.save(User.create("no@example.com", Provider.KAKAO, "p-no", "남")).getId();
		postId = createPost();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE post_hashtag, post_image, post_like, post_comment, post, hashtag,
					"user" RESTART IDENTITY CASCADE
				""");
	}

	@Test
	@DisplayName("1단계는 200이고 요청한 장수만큼 (key, uploadUrl)을 돌려준다 — key 접두사가 글에 묶인다")
	void presign_200() throws Exception {
		mockMvc.perform(uploadUrls(authorId, List.of("image/webp", "image/webp")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(2))
				.andExpect(jsonPath("$.items[0].imageKey")
						.value(org.hamcrest.Matchers.startsWith("post-images/" + postId + "/")))
				.andExpect(jsonPath("$.items[0].uploadUrl").isNotEmpty());
	}

	@Test
	@DisplayName("지원하지 않는 MIME 타입은 400이다 — 확장자를 정할 수 없으면 key를 못 만든다")
	void 모르는_타입은_400() throws Exception {
		mockMvc.perform(uploadUrls(authorId, List.of("application/pdf")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_UNSUPPORTED_IMAGE_TYPE"));
	}

	@Test
	@DisplayName("남의 글에는 presign도 등록도 안 된다 — 403")
	void 남의_글은_403() throws Exception {
		mockMvc.perform(uploadUrls(strangerId, List.of("image/webp")))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("POST_NOT_OWNED"));
	}

	@Test
	@DisplayName("2단계 등록은 201이고 상세·목록에 presigned GET URL로 실린다")
	void 등록_201() throws Exception {
		String key = firstKey(List.of("image/webp"));

		mockMvc.perform(register(authorId, key, true))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.imageKey").value(key))
				.andExpect(jsonPath("$.imageUrl").isNotEmpty())
				.andExpect(jsonPath("$.isPrimary").value(true));

		mockMvc.perform(get("/api/v1/posts/" + postId))
				.andExpect(jsonPath("$.images.length()").value(1))
				.andExpect(jsonPath("$.images[0].isPrimary").value(true));
		mockMvc.perform(get("/api/v1/posts"))
				.andExpect(jsonPath("$.content[0].thumbnailUrl").isNotEmpty());
	}

	@Test
	@DisplayName("이 글의 key가 아니면 400이다 — 남의 파일 주소를 자기 글에 실을 수 없다")
	void 남의_key는_400() throws Exception {
		mockMvc.perform(register(authorId, "post-images/999999/stolen.webp", false))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_INVALID_IMAGE_KEY"));
	}

	@Test
	@DisplayName("대표를 옮기면 이전 대표가 내려간다 — 부분 유니크가 두 번째 true를 거부한다")
	void 대표_이동() throws Exception {
		List<String> keys = keys(List.of("image/webp", "image/webp"));
		mockMvc.perform(register(authorId, keys.get(0), true)).andExpect(status().isCreated());
		mockMvc.perform(register(authorId, keys.get(1), true)).andExpect(status().isCreated());

		mockMvc.perform(get("/api/v1/posts/" + postId))
				.andExpect(jsonPath("$.images.length()").value(2))
				// 필터 결과에 length()를 붙이면 배열 길이가 아니라 원소의 필드 수가 나온다 —
				// hasSize로 배열 자체를 센다.
				.andExpect(jsonPath("$.images[?(@.isPrimary == true)]",
						org.hamcrest.Matchers.hasSize(1)))
				.andExpect(jsonPath("$.images[1].isPrimary").value(true));
	}

	@Test
	@DisplayName("21장째는 400이다 — 상한은 WAS만이 막는다")
	void 상한_20장() throws Exception {
		for (int i = 0; i < 20; i++) {
			mockMvc.perform(register(authorId, firstKey(List.of("image/webp")), false))
					.andExpect(status().isCreated());
		}

		mockMvc.perform(register(authorId, "post-images/" + postId + "/over.webp", false))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_IMAGE_LIMIT_EXCEEDED"));
		// 1단계도 "이미 있는 장수 + 요청 수"로 판단한다.
		mockMvc.perform(uploadUrls(authorId, List.of("image/webp")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("POST_IMAGE_LIMIT_EXCEEDED"));
	}

	@Test
	@DisplayName("사진 삭제는 204이고 없는 사진은 404다")
	void 삭제_204() throws Exception {
		String key = firstKey(List.of("image/webp"));
		MvcResult created =
				mockMvc.perform(register(authorId, key, false)).andExpect(status().isCreated())
						.andReturn();
		long imageId = read(created).get("id").asLong();

		mockMvc.perform(delete("/api/v1/posts/" + postId + "/images/" + imageId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNoContent());
		mockMvc.perform(delete("/api/v1/posts/" + postId + "/images/" + imageId)
						.header("Authorization", bearer(authorId)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("POST_IMAGE_NOT_FOUND"));
	}

	// --- 도우미 ---

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder uploadUrls(
			Long userId, List<String> contentTypes) throws Exception {
		return post("/api/v1/posts/" + postId + "/images/upload-urls")
				.header("Authorization", bearer(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(Map.of("contentTypes", contentTypes)));
	}

	private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder register(
			Long userId, String imageKey, boolean isPrimary) throws Exception {
		return post("/api/v1/posts/" + postId + "/images")
				.header("Authorization", bearer(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(
						Map.of("imageKey", imageKey, "isPrimary", isPrimary)));
	}

	private List<String> keys(List<String> contentTypes) throws Exception {
		MvcResult result = mockMvc.perform(uploadUrls(authorId, contentTypes))
				.andExpect(status().isOk())
				.andReturn();
		List<String> keys = new java.util.ArrayList<>();
		for (JsonNode item : read(result).get("items")) {
			keys.add(item.get("imageKey").asText());
		}
		return keys;
	}

	private String firstKey(List<String> contentTypes) throws Exception {
		return keys(contentTypes).getFirst();
	}

	private long createPost() throws Exception {
		MvcResult result = mockMvc.perform(post("/api/v1/posts")
						.header("Authorization", bearer(authorId))
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(Map.of(
								"title", "사진 글", "content", "본문",
								"hashtags", Collections.<String>emptyList()))))
				.andExpect(status().isCreated())
				.andReturn();
		return read(result).get("id").asLong();
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
