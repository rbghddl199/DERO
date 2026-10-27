package com.brunchies.dero.product.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.Distribution;
import com.brunchies.dero.product.EmitterShape;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.dto.AssetResponse;
import com.brunchies.dero.product.dto.AssetUploadUrlResponse;
import com.brunchies.dero.product.dto.ProductEmitterResponse;
import com.brunchies.dero.product.service.AdminProductAssetService;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 에셋·발광 경로의 배선과 상태코드만 검증한다 — upsert 규칙·검증표는
 * {@code AdminProductAssetServicePersistenceTest} 몫이다.
 *
 * <p>못 박는 것은 셋이다: ① upsert라 201이 아니라 200 ② 발광 DELETE는 204 ③ 단일 필드 제약이
 * 서비스까지 못 가고 400에서 걸린다(Bean Validation이 실제로 붙어 있는가).
 */
@WebMvcTest(controllers = AdminProductAssetController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminProductAssetControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AdminProductAssetService adminProductAssetService;

	@Test
	@DisplayName("upload-url은 200 + assetKey·uploadUrl을 반환한다")
	void 발급() throws Exception {
		given(adminProductAssetService.presignUpload(eq(7L), any()))
				.willReturn(new AssetUploadUrlResponse("assets/7/uuid.glb", "https://s3/put?sig"));

		mockMvc.perform(post("/api/v1/admin/products/{productId}/asset/upload-url", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"contentType\":\"model/gltf-binary\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.assetKey").value("assets/7/uuid.glb"))
				.andExpect(jsonPath("$.uploadUrl").value("https://s3/put?sig"));
	}

	@Test
	@DisplayName("책상에 발급을 요청하면 422 PRODUCT_ASSET_NOT_APPLICABLE이다")
	void 발급_책상() throws Exception {
		given(adminProductAssetService.presignUpload(eq(9L), any()))
				.willThrow(new BusinessException(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE));

		mockMvc.perform(post("/api/v1/admin/products/{productId}/asset/upload-url", 9L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"contentType\":\"model/gltf-binary\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PRODUCT_ASSET_NOT_APPLICABLE"));
	}

	@Test
	@DisplayName("에셋 등록은 upsert라 201이 아니라 200이다")
	void 에셋_등록() throws Exception {
		given(adminProductAssetService.register(eq(7L), any())).willReturn(new AssetResponse(7L,
				"assets/7/uuid.glb", GlbExportMode.TEXTURE, null, null, 12_000,
				ReviewStatus.APPROVED, OffsetDateTime.parse("2026-07-31T14:12:00+09:00")));

		mockMvc.perform(put("/api/v1/admin/products/{productId}/asset", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"assetKey\":\"assets/7/uuid.glb\",\"glbExportMode\":\"TEXTURE\","
								+ "\"polygonCount\":12000}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviewStatus").value("APPROVED"))
				.andExpect(jsonPath("$.verifiedAt").exists());
	}

	@Test
	@DisplayName("glbExportMode가 없으면 400 검증 실패다 — 서비스까지 가지 않는다")
	void 에셋_등록_검증_실패() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{productId}/asset", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"assetKey\":\"assets/7/uuid.glb\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));

		then(adminProductAssetService).should(never()).register(any(), any());
	}

	@Test
	@DisplayName("발광 저작은 200 + 저장된 값을 반환한다")
	void 발광_등록() throws Exception {
		given(adminProductAssetService.registerEmitter(eq(7L), any()))
				.willReturn(new ProductEmitterResponse(7L, EmitterShape.SPOT, Distribution.FLOOD,
						800, 1_200, false, "#FFD9A0", 0, 220, -15));

		mockMvc.perform(put("/api/v1/admin/products/{productId}/emitter", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"shape\":\"SPOT\",\"distribution\":\"FLOOD\",\"lumens\":800,"
								+ "\"radiusMm\":1200,\"recolorable\":false,\"defaultColor\":\"#FFD9A0\","
								+ "\"pointXMm\":0,\"pointYMm\":220,\"pointZMm\":-15}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.shape").value("SPOT"))
				.andExpect(jsonPath("$.defaultColor").value("#FFD9A0"));
	}

	@Test
	@DisplayName("defaultColor가 #RRGGBB가 아니면 400 검증 실패다")
	void 발광_색_형식_실패() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{productId}/emitter", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"shape\":\"POINT\",\"lumens\":800,\"radiusMm\":1200,"
								+ "\"recolorable\":false,\"defaultColor\":\"FFD9A0\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));

		then(adminProductAssetService).should(never()).registerEmitter(any(), any());
	}

	@Test
	@DisplayName("lumens가 0 이하면 400 검증 실패다")
	void 발광_광속_실패() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{productId}/emitter", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"shape\":\"POINT\",\"lumens\":0,\"radiusMm\":1200,"
								+ "\"recolorable\":false,\"defaultColor\":\"#FFD9A0\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("recolorable을 빠뜨리면 400이다 — 박싱 타입이라 false로 둔갑하지 않는다")
	void 발광_리컬러_누락() throws Exception {
		mockMvc.perform(put("/api/v1/admin/products/{productId}/emitter", 7L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"shape\":\"POINT\",\"lumens\":800,\"radiusMm\":1200,"
								+ "\"defaultColor\":\"#FFD9A0\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("발광 삭제는 204다")
	void 발광_삭제() throws Exception {
		mockMvc.perform(delete("/api/v1/admin/products/{productId}/emitter", 7L))
				.andExpect(status().isNoContent());

		then(adminProductAssetService).should().removeEmitter(7L);
	}
}
