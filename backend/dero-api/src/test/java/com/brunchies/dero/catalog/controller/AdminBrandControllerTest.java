package com.brunchies.dero.catalog.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlResponse;
import com.brunchies.dero.catalog.dto.BrandResponse;
import com.brunchies.dero.catalog.service.AdminBrandService;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
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
 * 상태 코드·{@code Location}·페이지 파라미터 클램프 배선만 검증한다 — 중복·게이트 판정은
 * {@code CatalogAdminServicePersistenceTest} 몫이다.
 *
 * <p>마스터 6종 중 <b>파일 흐름이 있는 둘</b>(브랜드 로고·상판 재질 맵)만 슬라이스를 둔다. 나머지
 * 넷은 이 컨트롤러와 배선이 글자 그대로 같아 같은 테스트를 네 벌 더 두는 값어치가 없다.
 */
@WebMvcTest(controllers = AdminBrandController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminBrandControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AdminBrandService adminBrandService;

	@Test
	@DisplayName("목록은 200 + OffsetPage 봉투를 반환한다")
	void 목록_성공() throws Exception {
		given(adminBrandService.list(0, 20)).willReturn(new OffsetPage<>(
				List.of(new BrandResponse(7L, "데스커", null, null, null)),
				new OffsetPage.PageInfo(0, 20, 1, 1)));

		mockMvc.perform(get("/api/v1/admin/brands"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(7))
				.andExpect(jsonPath("$.content[0].name").value("데스커"))
				.andExpect(jsonPath("$.page.totalElements").value(1));
	}

	/**
	 * 클램프가 어노테이션이 아니라 컨트롤러 코드라 이 테스트가 유일한 방어선이다
	 * ({@code @Validated}를 쓰면 {@code ConstraintViolationException}이 500이 되는 사정은
	 * {@code AdminPageParams} javadoc 참조).
	 */
	@Test
	@DisplayName("size가 상한을 넘으면 100으로, page가 음수면 0으로 잘린다")
	void 목록_페이지_클램프() throws Exception {
		given(adminBrandService.list(0, 100)).willReturn(new OffsetPage<>(
				List.of(), new OffsetPage.PageInfo(0, 100, 0, 0)));

		mockMvc.perform(get("/api/v1/admin/brands").param("page", "-5").param("size", "9999"))
				.andExpect(status().isOk());

		then(adminBrandService).should().list(0, 100);
	}

	@Test
	@DisplayName("등록은 201 + Location을 반환한다")
	void 등록_성공() throws Exception {
		given(adminBrandService.create(any()))
				.willReturn(new BrandResponse(7L, "데스커", null, null, null));

		mockMvc.perform(post("/api/v1/admin/brands")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"데스커\"}"))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/admin/brands/7"))
				.andExpect(jsonPath("$.id").value(7));
	}

	@Test
	@DisplayName("name이 비어 있으면 400 검증 실패다")
	void 등록_검증_실패() throws Exception {
		mockMvc.perform(post("/api/v1/admin/brands")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("이름이 중복되면 409 CATALOG_BRAND_NAME_DUPLICATED다")
	void 등록_이름_중복() throws Exception {
		given(adminBrandService.create(any())).willThrow(
				new BusinessException(CatalogErrorCode.CATALOG_BRAND_NAME_DUPLICATED));

		mockMvc.perform(post("/api/v1/admin/brands")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"데스커\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CATALOG_BRAND_NAME_DUPLICATED"));
	}

	@Test
	@DisplayName("부분 수정은 200 + 갱신된 본문을 반환한다")
	void 수정_성공() throws Exception {
		given(adminBrandService.update(eq(7L), any())).willReturn(
				new BrandResponse(7L, "데스커", null, null, "brand-logos/7/logo.png"));

		mockMvc.perform(patch("/api/v1/admin/brands/{brandId}", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"logoImageKey\":\"brand-logos/7/logo.png\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.logoImageKey").value("brand-logos/7/logo.png"));
	}

	@Test
	@DisplayName("삭제는 204를 반환하고, 참조 중이면 409 CATALOG_BRAND_IN_USE다")
	void 삭제_성공과_게이트() throws Exception {
		mockMvc.perform(delete("/api/v1/admin/brands/{brandId}", 7L))
				.andExpect(status().isNoContent());

		willThrow(new BusinessException(CatalogErrorCode.CATALOG_BRAND_IN_USE))
				.given(adminBrandService).delete(9L);

		mockMvc.perform(delete("/api/v1/admin/brands/{brandId}", 9L))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CATALOG_BRAND_IN_USE"));
	}

	@Test
	@DisplayName("로고 presign은 200 + logoKey·uploadUrl을 반환한다 (저장하는 게 없어 201이 아니다)")
	void 로고_발급_성공() throws Exception {
		given(adminBrandService.presignLogoUpload(eq(7L), any())).willReturn(
				new BrandLogoUploadUrlResponse("brand-logos/7/uuid.png", "https://s3/put?sig"));

		mockMvc.perform(post("/api/v1/admin/brands/{brandId}/logo/upload-url", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fileName\":\"logo.png\",\"contentType\":\"image/png\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.logoKey").value("brand-logos/7/uuid.png"))
				.andExpect(jsonPath("$.uploadUrl").value("https://s3/put?sig"));
	}

	@Test
	@DisplayName("이미지가 아닌 contentType이면 400 CATALOG_INVALID_IMAGE_CONTENT_TYPE이다")
	void 로고_발급_컨텐츠타입_거부() throws Exception {
		given(adminBrandService.presignLogoUpload(eq(7L), any())).willThrow(
				new BusinessException(CatalogErrorCode.CATALOG_INVALID_IMAGE_CONTENT_TYPE));

		mockMvc.perform(post("/api/v1/admin/brands/{brandId}/logo/upload-url", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fileName\":\"a.exe\",\"contentType\":\"application/octet-stream\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CATALOG_INVALID_IMAGE_CONTENT_TYPE"));
	}
}
