package com.brunchies.dero.community.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.community.service.ProductLikeService;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code GET /products?liked=me}를 <b>HTTP + 진짜 Postgres</b>로 검증한다(DERO-356).
 *
 * <p><b>여기서만 볼 수 있는 것 둘</b>:
 *
 * <ul>
 *   <li><b>라우팅</b> — 같은 경로 {@code /api/v1/products}에 핸들러가 둘이다({@code ProductController}의
 *       카탈로그 목록과 이 티켓의 찜 목록). {@code params = "liked"} 조건이 실제로 더 구체적인 매핑으로
 *       뽑히는지는 두 컨트롤러가 다 등록된 전체 컨텍스트에서만 확인된다 — 슬라이스 테스트로는 안 잡힌다.
 *   <li><b>401</b> — {@code SecurityConfig}는 쿼리 파라미터를 못 봐서 이 요청도 {@code permitAll}로
 *       통과한다. 401이 핸들러에서 나오는지는 시큐리티 필터가 살아 있는 이 배치에서만 검증된다.
 * </ul>
 */
@AutoConfigureMockMvc
class LikedProductApiTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private ProductLikeService productLikeService;

	@Autowired
	private ProductRepository products;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private DeskTextureRepository deskTextures;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private String bearer;
	private String otherBearer;
	private Long likedProductId;

	@BeforeEach
	void setUp() {
		Long userId =
				users.save(User.create("liked-api@example.com", Provider.KAKAO, "p-liked-api", "나")).getId();
		Long otherUserId = users.save(
				User.create("liked-api-other@example.com", Provider.KAKAO, "p-liked-api-other", "남")).getId();
		bearer = "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
		otherBearer = "Bearer " + jwtIssuer.issueAccessToken(otherUserId, UserRole.USER);

		Category category = categories.save(Category.createRoot("책상", null, 1));
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		likedProductId = products.save(Desk.create(ProductSource.CATALOG, null, null, category,
						"찜한 책상", null, 250_000, null, 1400, 700, 720, 25, 30, false, texture,
						FrameType.T_FRAME, null))
				.getId();
		products.save(Desk.create(ProductSource.CATALOG, null, null, category, "안 찜한 책상", null,
				300_000, null, 1600, 700, 720, 25, 30, false, texture, FrameType.T_FRAME, null));
		entityManager.flush();

		productLikeService.like(userId, likedProductId);
		entityManager.flush();
		entityManager.clear();
	}

	@Test
	@DisplayName("비로그인 GET /products?liked=me는 401이다 — 카탈로그 permitAll이 덮지 못한다")
	void 비로그인_401() throws Exception {
		mockMvc.perform(get("/api/v1/products").param("liked", "me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
	}

	@Test
	@DisplayName("로그인하면 내가 찜한 제품만 목록 원소(규격 포함) 그대로 나온다")
	void 내_찜_목록() throws Exception {
		mockMvc.perform(get("/api/v1/products")
						.param("liked", "me")
						.header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(likedProductId))
				.andExpect(jsonPath("$.content[0].desk.widthMm").value(1400))
				.andExpect(jsonPath("$.totalCount").value(1))
				.andExpect(jsonPath("$.hasNext").value(false));
	}

	@Test
	@DisplayName("남의 찜은 안 보인다 — 아무것도 안 찜한 사용자는 빈 목록이다")
	void 남의_찜은_안_보인다() throws Exception {
		mockMvc.perform(get("/api/v1/products")
						.param("liked", "me")
						.header(HttpHeaders.AUTHORIZATION, otherBearer))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0))
				.andExpect(jsonPath("$.totalCount").value(0));
	}

	@Test
	@DisplayName("liked 파라미터가 없으면 카탈로그 목록으로 간다 — 찜 안 한 제품까지 나온다")
	void liked_없으면_카탈로그_목록() throws Exception {
		mockMvc.perform(get("/api/v1/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[?(@.name == '안 찜한 책상')]").exists());
	}

	@Test
	@DisplayName("liked=me가 아니면 400이다 — 필터가 조용히 무시되지 않는다")
	void liked_값_검증() throws Exception {
		mockMvc.perform(get("/api/v1/products")
						.param("liked", "999")
						.header(HttpHeaders.AUTHORIZATION, bearer))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}
}
