package com.brunchies.dero.product.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.dto.ProductImageResponse;
import com.brunchies.dero.product.dto.ProductImageUploadUrlResponse;
import com.brunchies.dero.product.service.ProductImageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 2단계 presign 경로의 배선만 검증한다 — key 조립·저장은 {@code ProductImageService} 몫.
 *
 * <p>옛 {@code POST /products/images/presign}이 {@code POST /products/{id}/images/upload-urls}로
 * 옮겨진 것을 못 박는다(`docs/context/api-spec.md` §11).
 */
@WebMvcTest(controllers = ProductImageController.class)
@AutoConfigureMockMvc(addFilters = false)
class ProductImageControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private ProductImageService productImageService;

	@Test
	@DisplayName("upload-urls는 200 + imageKey·uploadUrl을 반환한다 (저장하는 게 없어 201이 아니다)")
	void 발급_성공() throws Exception {
		given(productImageService.presignUpload(eq(7L), any())).willReturn(
				new ProductImageUploadUrlResponse("product-images/7/uuid.png", "https://s3/put?sig"));

		mockMvc.perform(post("/api/v1/products/{productId}/images/upload-urls", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fileName\":\"a.png\",\"contentType\":\"image/png\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.imageKey").value("product-images/7/uuid.png"))
				.andExpect(jsonPath("$.uploadUrl").value("https://s3/put?sig"));
	}

	@Test
	@DisplayName("contentType이 비어 있으면 400 검증 실패다")
	void 발급_검증_실패() throws Exception {
		mockMvc.perform(post("/api/v1/products/{productId}/images/upload-urls", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fileName\":\"a.png\",\"contentType\":\"\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("없는 제품에 발급을 요청하면 404 PRODUCT_NOT_FOUND다")
	void 발급_제품_없음() throws Exception {
		given(productImageService.presignUpload(eq(999L), any()))
				.willThrow(new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));

		mockMvc.perform(post("/api/v1/products/{productId}/images/upload-urls", 999L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fileName\":\"a.png\",\"contentType\":\"image/png\"}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"));
	}

	@Test
	@DisplayName("key 등록은 201 + Location을 반환한다")
	void 등록_성공() throws Exception {
		given(productImageService.register(eq(7L), any()))
				.willReturn(new ProductImageResponse(42L, "product-images/7/uuid.png", 0, true));

		mockMvc.perform(post("/api/v1/products/{productId}/images", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"imageKey\":\"product-images/7/uuid.png\",\"displayOrder\":0,"
								+ "\"isPrimary\":true}"))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/products/7/images/42"))
				.andExpect(jsonPath("$.id").value(42))
				.andExpect(jsonPath("$.isPrimary").value(true));
	}

	@Test
	@DisplayName("대표 지정은 본문 없이 204다 — 기존 대표 해제는 서버가 한다")
	void 대표_지정() throws Exception {
		mockMvc.perform(put("/api/v1/products/{productId}/images/{imageId}/primary", 7L, 42L))
				.andExpect(status().isNoContent());

		then(productImageService).should().designatePrimary(7L, 42L);
	}

	@Test
	@DisplayName("그 제품의 이미지가 아니면 404 PRODUCT_IMAGE_NOT_FOUND다")
	void 대표_지정_이미지_없음() throws Exception {
		willThrow(new BusinessException(ProductErrorCode.PRODUCT_IMAGE_NOT_FOUND))
				.given(productImageService).designatePrimary(7L, 99L);

		mockMvc.perform(put("/api/v1/products/{productId}/images/{imageId}/primary", 7L, 99L))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PRODUCT_IMAGE_NOT_FOUND"));
	}

	@Test
	@DisplayName("이미지 삭제는 본문 없이 204다")
	void 삭제() throws Exception {
		mockMvc.perform(delete("/api/v1/products/{productId}/images/{imageId}", 7L, 42L))
				.andExpect(status().isNoContent());

		then(productImageService).should().delete(7L, 42L);
	}

	@Test
	@DisplayName("imageKey가 비어 있으면 400 검증 실패다")
	void 등록_검증_실패() throws Exception {
		mockMvc.perform(post("/api/v1/products/{productId}/images", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"imageKey\":\"\",\"displayOrder\":0,\"isPrimary\":false}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}
}
