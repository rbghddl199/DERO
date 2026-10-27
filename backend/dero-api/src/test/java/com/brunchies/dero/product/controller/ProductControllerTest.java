package com.brunchies.dero.product.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.DeskSpecRequest;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.dto.ProductImageDetailResponse;
import com.brunchies.dero.product.service.ProductCatalogService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 컨트롤러 배선(요청 파라미터·응답 모양)만 검증한다 — 쿼리·커서 로직은 {@code ProductCatalogService} 몫.
 *
 * <p>옛 {@code GET /products/desks}가 {@code GET /products?specType=DESK}로 흡수된 것을 못 박는다
 * (`docs/context/api-spec.md` §11).
 */
@WebMvcTest(controllers = ProductController.class)
@AutoConfigureMockMvc(addFilters = false)
class ProductControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private ProductCatalogService productCatalogService;

	@MockitoBean
	private SearchEventLogger searchEventLogger;

	@Test
	@DisplayName("specType=DESK만 주면 기본값(size=20)으로 서비스를 부른다")
	void 기본_조회() throws Exception {
		given(productCatalogService.list(eq(SpecType.DESK), isNull(), isNull(), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 1));

		mockMvc.perform(get("/api/v1/products").param("specType", "DESK"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7))
				.andExpect(jsonPath("$.content[0].desk.widthMm").value(1400))
				.andExpect(jsonPath("$.hasNext").value(false))
				.andExpect(jsonPath("$.nextCursor").doesNotExist())
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("size가 100을 넘으면 100으로 잘라 서비스를 부른다")
	void size_상한_클램프() throws Exception {
		given(productCatalogService.list(eq(SpecType.DESK), isNull(), isNull(), isNull(), eq(100)))
				.willReturn(new CursorPage<>(List.of(), null, false, 0));

		mockMvc.perform(get("/api/v1/products")
						.param("specType", "DESK")
						.param("size", "10000"))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("cursor 파라미터를 그대로 서비스에 전달한다")
	void cursor_전달() throws Exception {
		given(productCatalogService.list(eq(SpecType.DESK), isNull(), isNull(), eq("abc"), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), "def", true, 5));

		mockMvc.perform(get("/api/v1/products")
						.param("specType", "DESK")
						.param("cursor", "abc"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.nextCursor").value("def"))
				.andExpect(jsonPath("$.hasNext").value(true))
				.andExpect(jsonPath("$.totalCount").value(5));
	}

	@Test
	@DisplayName("specType·categoryId를 생략하면 전체 제품을 기본값(size=20)으로 조회한다 — 둘 다 선택 필터다(DERO-325)")
	void 필터_생략_전체_조회() throws Exception {
		given(productCatalogService.list(isNull(), isNull(), isNull(), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 1));

		mockMvc.perform(get("/api/v1/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7));
	}

	@Test
	@DisplayName("categoryId 하나만 실으면 원소 1개짜리 목록으로 바인딩된다 — 기존 호출 하위호환")
	void categoryId_단수_하위호환() throws Exception {
		given(productCatalogService.list(isNull(), eq(List.of(52L)), isNull(), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 1));

		mockMvc.perform(get("/api/v1/products").param("categoryId", "52"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7));
	}

	@Test
	@DisplayName("categoryId를 반복해서 실으면 순서대로 목록에 담아 서비스를 부른다 — '전체' 타일이 대분류 여러 개를 한 번에 건다")
	void categoryId_복수() throws Exception {
		given(productCatalogService.list(isNull(), eq(List.of(52L, 53L, 55L)), isNull(), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 1));

		mockMvc.perform(get("/api/v1/products")
						.param("categoryId", "52")
						.param("categoryId", "53")
						.param("categoryId", "55"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7));
	}

	@Test
	@DisplayName("categoryId가 상한(100개)을 넘으면 자르지 않고 400 — 조용히 빠진 목록을 200으로 내보내지 않는다")
	void categoryId_상한_초과는_400() throws Exception {
		var request = get("/api/v1/products");
		for (int i = 0; i < 101; i++) {
			request = request.param("categoryId", String.valueOf(i));
		}

		mockMvc.perform(request).andExpect(status().isBadRequest());

		then(productCatalogService).shouldHaveNoInteractions();
	}

	// --- 검색어 이벤트 (387 · ADR-0020 결정 7) ---

	@Test
	@DisplayName("q가 실리면 검색어·노출 결과 수·userId를 검색어 이벤트로 남긴다")
	void 검색어_이벤트() throws Exception {
		given(productCatalogService.list(isNull(), isNull(), eq("모니터"), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 3));

		mockMvc.perform(get("/api/v1/products")
						.param("q", "모니터")
						.principal(인증("42", "ROLE_USER")))
				.andExpect(status().isOk());

		then(searchEventLogger).should().searched(SearchIndex.PRODUCTS, "모니터", 3L, 42L);
	}

	@Test
	@DisplayName("비로그인 검색은 userId가 null이다 — 이메일·IP는 애초에 싣지 않는다")
	void 검색어_이벤트_비로그인() throws Exception {
		given(productCatalogService.list(isNull(), isNull(), eq("책상"), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(), null, false, 0));

		mockMvc.perform(get("/api/v1/products").param("q", "책상"))
				.andExpect(status().isOk());

		// 0건도 남긴다 — 결과 0건 검색어가 카탈로그 구멍 목록이라 이쪽이 오히려 핵심이다.
		then(searchEventLogger).should().searched(SearchIndex.PRODUCTS, "책상", 0L, null);
	}

	@Test
	@DisplayName("q가 없으면 검색어 이벤트를 남기지 않는다")
	void 검색어_이벤트_없음() throws Exception {
		given(productCatalogService.list(isNull(), isNull(), isNull(), isNull(), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 1));

		mockMvc.perform(get("/api/v1/products")).andExpect(status().isOk());

		then(searchEventLogger).shouldHaveNoInteractions();
	}

	@Test
	@DisplayName("같은 검색의 다음 페이지는 이벤트를 남기지 않는다 — 이벤트 하나가 검색 한 번이다")
	void 검색어_이벤트_다음_페이지는_제외() throws Exception {
		given(productCatalogService.list(isNull(), isNull(), eq("모니터"), eq("abc"), eq(20)))
				.willReturn(new CursorPage<>(List.of(상세()), null, false, 3));

		mockMvc.perform(get("/api/v1/products").param("q", "모니터").param("cursor", "abc"))
				.andExpect(status().isOk());

		then(searchEventLogger).shouldHaveNoInteractions();
	}

	/**
	 * <b>404가 아니라 400으로 바뀌었다</b>(2026-07-31, 단건 상세 추가) — {@code GET /products/{id}}가
	 * 생기면서 {@code desks}가 {@code productId} 자리에 매칭되고, 숫자가 아니라 타입 변환에서 막힌다.
	 * 옛 컬렉션 경로가 사라졌다는 사실은 그대로다. {@code {productId:\\d+}}로 숫자만 받게 하면 404를
	 * 되찾을 수 있지만, 다른 컨트롤러({@code AdminProductController}·{@code ProductImageController})가
	 * 전부 제약 없는 {@code {id}}라 여기만 바꾸면 두 방식이 공존한다.
	 */
	@Test
	@DisplayName("옛 경로 /products/desks는 더 이상 없다 — 이제 상세 경로에 걸려 400이다")
	void 옛_경로_제거() throws Exception {
		mockMvc.perform(get("/api/v1/products/desks"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	// --- 단건 상세 ---

	private ProductDetailResponse 상세() {
		return new ProductDetailResponse(7L, SpecType.DESK, ProductSource.CATALOG, 3L, "데스커", 5L,
				"책상", "1400 책상", null, 250_000, "https://example.com/desk", ProductStatus.ACTIVE,
				new DeskSpecRequest(1400, 700, 720, 25, 30, false, 9L, FrameType.T_FRAME, null),
				null, null, null, null,
				null, null,
				List.of(new ProductImageDetailResponse(11L, "https://s3/get?sig", 0, true)),
				List.of());
	}

	@Test
	@DisplayName("상세는 200 + specType이 가리키는 규격 칸 하나만 채워 내려준다")
	void 상세_조회() throws Exception {
		given(productCatalogService.getDetail(7L, null, false)).willReturn(상세());

		mockMvc.perform(get("/api/v1/products/{productId}", 7L))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(7))
				.andExpect(jsonPath("$.specType").value("DESK"))
				.andExpect(jsonPath("$.brandName").value("데스커"))
				.andExpect(jsonPath("$.categoryName").value("책상"))
				.andExpect(jsonPath("$.status").value("ACTIVE"))
				.andExpect(jsonPath("$.desk.widthMm").value(1400))
				.andExpect(jsonPath("$.monitor").doesNotExist())
				.andExpect(jsonPath("$.asset").doesNotExist())
				.andExpect(jsonPath("$.emitter").doesNotExist())
				.andExpect(jsonPath("$.images[0].imageId").value(11))
				.andExpect(jsonPath("$.images[0].imageUrl").value("https://s3/get?sig"));
	}

	@Test
	@DisplayName("인증이 없으면 서비스에 익명(userId=null, admin=false)으로 넘어간다")
	void 상세_익명() throws Exception {
		given(productCatalogService.getDetail(7L, null, false)).willReturn(상세());

		mockMvc.perform(get("/api/v1/products/{productId}", 7L))
				.andExpect(status().isOk());

		then(productCatalogService).should().getDetail(7L, null, false);
	}

	@Test
	@DisplayName("일반 로그인은 sub를 userId로 넘기고 admin은 false다")
	void 상세_로그인() throws Exception {
		given(productCatalogService.getDetail(7L, 42L, false)).willReturn(상세());

		mockMvc.perform(get("/api/v1/products/{productId}", 7L).principal(인증("42", "ROLE_USER")))
				.andExpect(status().isOk());

		then(productCatalogService).should().getDetail(7L, 42L, false);
	}

	@Test
	@DisplayName("ROLE_ADMIN 권한이 있으면 admin=true로 넘어간다")
	void 상세_관리자() throws Exception {
		given(productCatalogService.getDetail(7L, 42L, true)).willReturn(상세());

		mockMvc.perform(get("/api/v1/products/{productId}", 7L).principal(인증("42", "ROLE_ADMIN")))
				.andExpect(status().isOk());

		then(productCatalogService).should().getDetail(7L, 42L, true);
	}

	@Test
	@DisplayName("익명 토큰의 이름(anonymousUser)은 userId로 파싱되지 않고 null이 된다")
	void 상세_익명_토큰() throws Exception {
		given(productCatalogService.getDetail(7L, null, false)).willReturn(상세());

		mockMvc.perform(get("/api/v1/products/{productId}", 7L)
						.principal(인증("anonymousUser", "ROLE_ANONYMOUS")))
				.andExpect(status().isOk());

		then(productCatalogService).should().getDetail(7L, null, false);
	}

	@Test
	@DisplayName("없거나 볼 권한이 없는 제품은 404 PRODUCT_NOT_FOUND다 — 403이 아니다")
	void 상세_없음() throws Exception {
		given(productCatalogService.getDetail(999L, null, false))
				.willThrow(new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));

		mockMvc.perform(get("/api/v1/products/{productId}", 999L))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"));
	}

	private static Authentication 인증(String name, String authority) {
		return new UsernamePasswordAuthenticationToken(
				name, null, List.of(new SimpleGrantedAuthority(authority)));
	}
}
