package com.brunchies.dero.commerce.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code /cart-items}의 <b>HTTP 계약</b>을 본다 — 상태 코드와 인가는 서비스 테스트로는 판정할 수 없다.
 * 특히 "수량 0 이하는 4xx"는 {@code @Min(1)}이 붙은 요청 DTO를 컨트롤러가 {@code @Valid}로 실제로
 * 검사할 때만 성립한다.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PlacementControllerTest}와 같다 — MockMvc 요청이 테스트
 * 트랜잭션에 참여하면 실패 경로가 rollback-only를 만들어 뒤의 검증이 통째로 죽는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CartItemControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private ProductRepository products;

	@Autowired
	private JdbcTemplate jdbc;

	private Long ownerId;
	private Long strangerId;
	private Long productId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("cart@example.com", Provider.KAKAO, "p-cart", "주인"))
				.getId();
		strangerId = users.save(User.create("other@example.com", Provider.GOOGLE, "p-oth", "남"))
				.getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		productId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"27인치 모니터", null, 350_000, null, 610, 200, 400, 5_500, false, MountSurface.TOP))
				.getId();
	}

	/** 테스트 트랜잭션이 없어 각 요청이 커밋된다 — 다음 테스트에 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE cart_item, product, category, "user" RESTART IDENTITY CASCADE
				""");
	}

	@Test
	@DisplayName("비로그인은 401이다 — 장바구니는 전부 🔒다")
	void 비로그인_401() throws Exception {
		mockMvc.perform(get("/api/v1/cart-items"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("담기는 201 + Location이고 목록에 나온다")
	void 담기_201() throws Exception {
		mockMvc.perform(post("/api/v1/cart-items")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"productId\":%d}".formatted(productId)))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", Matchers.startsWith("/api/v1/cart-items/")))
				.andExpect(jsonPath("$.quantity").value(1))
				.andExpect(jsonPath("$.productName").value("27인치 모니터"))
				.andExpect(jsonPath("$.lineTotalKrw").value(350_000));

		mockMvc.perform(get("/api/v1/cart-items").header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	@DisplayName("수량을 0 이하로 보내면 400이다 — 빼기는 DELETE다")
	void 수량_0_이하는_400() throws Exception {
		long cartItemId = add();

		mockMvc.perform(patchQuantity(cartItemId, ownerId, 0))
				.andExpect(status().isBadRequest());
		mockMvc.perform(patchQuantity(cartItemId, ownerId, -3))
				.andExpect(status().isBadRequest());

		mockMvc.perform(get("/api/v1/cart-items").header("Authorization", bearer(ownerId)))
				.andExpect(jsonPath("$[0].quantity").value(1));
	}

	@Test
	@DisplayName("남의 항목에 PATCH·DELETE를 부르면 404이고 항목은 그대로 남는다")
	void 남의_항목은_404() throws Exception {
		long cartItemId = add();

		mockMvc.perform(patchQuantity(cartItemId, strangerId, 9))
				.andExpect(status().isNotFound());
		mockMvc.perform(delete("/api/v1/cart-items/" + cartItemId)
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isNotFound());

		mockMvc.perform(get("/api/v1/cart-items").header("Authorization", bearer(ownerId)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].quantity").value(1));
	}

	@Test
	@DisplayName("빼면 204이고 목록에서 사라진다")
	void 빼기_204() throws Exception {
		long cartItemId = add();

		mockMvc.perform(delete("/api/v1/cart-items/" + cartItemId)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/api/v1/cart-items").header("Authorization", bearer(ownerId)))
				.andExpect(jsonPath("$.length()").value(0));
	}

	private long add() throws Exception {
		String location = mockMvc.perform(post("/api/v1/cart-items")
						.header("Authorization", bearer(ownerId))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"productId\":%d}".formatted(productId)))
				.andExpect(status().isCreated())
				.andReturn()
				.getResponse()
				.getHeader("Location");
		return Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
	}

	private org.springframework.test.web.servlet.RequestBuilder patchQuantity(
			long cartItemId, Long userId, int quantity) {
		return patch("/api/v1/cart-items/" + cartItemId)
				.header("Authorization", bearer(userId))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"quantity\":%d}".formatted(quantity));
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
