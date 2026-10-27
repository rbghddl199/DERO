package com.brunchies.dero.product.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductResponse;
import com.brunchies.dero.product.dto.AdminProductSummaryResponse;
import com.brunchies.dero.product.service.AdminProductService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 관리자 제품 경로의 배선만 검증한다 — 등록·병합·검수 로직은
 * {@code AdminProductServicePersistenceTest} 몫이다.
 *
 * <p>못 박는 것 셋: ⑴ 상태코드 계약(201+{@code Location} / 200 / 204), ⑵ 관리자 목록이
 * {@code OffsetPage} 봉투 + {@code page}·{@code size} 클램프라는 것, ⑶ 등록 검증이
 * {@code OnCreate} 그룹을 태워 규격 boolean 누락을 400으로 막는다는 것.
 */
@WebMvcTest(controllers = AdminProductController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminProductControllerTest {

	private static final String MONITOR_SPEC = """
			"monitor":{"diagonalInch":27.0,"aspectWidth":16,"aspectHeight":9,"bezelMm":8,
			"panelShape":"FLAT","standDepthMm":130,"isStandDetachable":true,
			"isPivotSupported":true,"weightG":5000}""";

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AdminProductService adminProductService;

	@Test
	@DisplayName("목록은 200 + OffsetPage 봉투(content·page)를 반환한다")
	void 목록() throws Exception {
		given(adminProductService.list(
				eq(ReviewStatus.PENDING), eq(3L), eq(4L), eq("울트라"), eq(0), eq(20)))
				.willReturn(new OffsetPage<>(List.of(요약()), new OffsetPage.PageInfo(0, 20, 1, 1)));

		mockMvc.perform(get("/api/v1/admin/products")
						.param("status", "PENDING")
						.param("brandId", "3")
						.param("categoryId", "4")
						.param("keyword", "울트라"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7))
				.andExpect(jsonPath("$.content[0].specType").value("MONITOR"))
				.andExpect(jsonPath("$.content[0].reviewStatus").value("PENDING"))
				.andExpect(jsonPath("$.page.totalElements").value(1));
	}

	@Test
	@DisplayName("size는 [1,100]으로, page는 0 이상으로 잘려 서비스에 넘어간다")
	void 목록_클램프() throws Exception {
		given(adminProductService.list(eq(null), eq(null), eq(null), eq(null), eq(0), eq(100)))
				.willReturn(new OffsetPage<>(List.of(), new OffsetPage.PageInfo(0, 100, 0, 0)));

		mockMvc.perform(get("/api/v1/admin/products").param("page", "-3").param("size", "500"))
				.andExpect(status().isOk());

		then(adminProductService).should().list(null, null, null, null, 0, 100);
	}

	@Test
	@DisplayName("등록은 201 + Location을 반환한다")
	void 등록() throws Exception {
		given(adminProductService.create(any())).willReturn(응답());

		mockMvc.perform(post("/api/v1/admin/products")
						.contentType(MediaType.APPLICATION_JSON)
						.content(등록_본문(MONITOR_SPEC)))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/admin/products/7"))
				.andExpect(jsonPath("$.id").value(7))
				.andExpect(jsonPath("$.specType").value("MONITOR"))
				.andExpect(jsonPath("$.source").value("CATALOG"));
	}

	@Test
	@DisplayName("규격 boolean을 빠뜨리면 400이다 — 기본값으로 둔갑시키지 않는다")
	void 등록_규격_boolean_누락() throws Exception {
		String 스탠드분리_없음 = """
				"monitor":{"diagonalInch":27.0,"aspectWidth":16,"aspectHeight":9,"bezelMm":8,
				"panelShape":"FLAT","standDepthMm":130,"isPivotSupported":true,"weightG":5000}""";

		mockMvc.perform(post("/api/v1/admin/products")
						.contentType(MediaType.APPLICATION_JSON)
						.content(등록_본문(스탠드분리_없음)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("CATALOG 필수 필드(productUrl)가 비면 400이다")
	void 등록_카탈로그_필수_누락() throws Exception {
		String 본문 = """
				{"specType":"MONITOR","brandId":1,"categoryId":2,"name":"U2723QE",
				"priceKrw":700000,"productUrl":"",%s}""".formatted(MONITOR_SPEC);

		mockMvc.perform(post("/api/v1/admin/products")
						.contentType(MediaType.APPLICATION_JSON)
						.content(본문))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("수정은 200을 반환한다")
	void 수정() throws Exception {
		given(adminProductService.update(eq(7L), any())).willReturn(응답());

		mockMvc.perform(patch("/api/v1/admin/products/{id}", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"U2723QE 개정\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("U2723QE"));
	}

	@Test
	@DisplayName("규격 타입을 바꾸려 하면 422 PRODUCT_SPEC_TYPE_IMMUTABLE이다")
	void 수정_규격타입_변경() throws Exception {
		given(adminProductService.update(eq(7L), any()))
				.willThrow(new BusinessException(ProductErrorCode.PRODUCT_SPEC_TYPE_IMMUTABLE));

		mockMvc.perform(patch("/api/v1/admin/products/{id}", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"specType\":\"DESK\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PRODUCT_SPEC_TYPE_IMMUTABLE"));
	}

	@Test
	@DisplayName("삭제는 204다")
	void 삭제() throws Exception {
		mockMvc.perform(delete("/api/v1/admin/products/{id}", 7L))
				.andExpect(status().isNoContent());

		then(adminProductService).should().delete(7L);
	}

	@Test
	@DisplayName("검수는 204다")
	void 검수() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{id}/review", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"result\":\"APPROVED\"}"))
				.andExpect(status().isNoContent());

		then(adminProductService).should().review(eq(7L), any());
	}

	@Test
	@DisplayName("검수 결과가 비면 400이다")
	void 검수_결과_누락() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{id}/review", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"note\":\"폴리곤 과다\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("에셋이 없는 제품을 검수하면 422 PRODUCT_ASSET_NOT_FOUND다")
	void 검수_에셋_없음() throws Exception {
		willThrow(new BusinessException(ProductErrorCode.PRODUCT_ASSET_NOT_FOUND))
				.given(adminProductService).review(eq(7L), any());

		mockMvc.perform(put("/api/v1/admin/products/{id}/review", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"result\":\"APPROVED\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PRODUCT_ASSET_NOT_FOUND"));
	}

	private static String 등록_본문(String 규격) {
		return """
				{"specType":"MONITOR","brandId":1,"categoryId":2,"name":"U2723QE",
				"priceKrw":700000,"productUrl":"https://example.com/u2723qe",%s}""".formatted(규격);
	}

	private static AdminProductResponse 응답() {
		return new AdminProductResponse(7L, SpecType.MONITOR, ProductSource.CATALOG, 1L, 2L,
				"U2723QE", null, 700_000, "https://example.com/u2723qe", ProductStatus.ACTIVE);
	}

	private static AdminProductSummaryResponse 요약() {
		return new AdminProductSummaryResponse(7L, SpecType.MONITOR, "U2723QE",
				ProductSource.CATALOG, ProductStatus.ACTIVE, 700_000, "델", "모니터",
				ReviewStatus.PENDING, null, null, OffsetDateTime.now());
	}
}
