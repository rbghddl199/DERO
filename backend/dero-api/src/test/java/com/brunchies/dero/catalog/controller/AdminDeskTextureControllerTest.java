package com.brunchies.dero.catalog.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.TextureMapKind;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlResponse;
import com.brunchies.dero.catalog.dto.DeskTextureResponse;
import com.brunchies.dero.catalog.service.AdminDeskTextureService;
import com.brunchies.dero.global.exception.BusinessException;
import java.math.BigDecimal;
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
 * 맵 presign 경로의 배선만 검증한다 — key 조립은 {@code AdminDeskTextureService} 몫이다.
 *
 * <p>맵 key <b>등록</b> 경로가 별도 엔드포인트가 아니라 {@code PATCH} 본문임을 못 박는다
 * (`docs/context/api-spec.md` §9).
 */
@WebMvcTest(controllers = AdminDeskTextureController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminDeskTextureControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private AdminDeskTextureService adminDeskTextureService;

	@Test
	@DisplayName("등록은 201 + Location을 반환하고 맵 key는 아직 NULL이다")
	void 등록_성공() throws Exception {
		given(adminDeskTextureService.create(any())).willReturn(new DeskTextureResponse(
				3L, "월넛", "#6B4A2F", null, null, null,
				new BigDecimal("0.65"), new BigDecimal("0.00"), 551, 1));

		mockMvc.perform(post("/api/v1/admin/desk-textures")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"월넛\",\"baseColor\":\"#6B4A2F\","
								+ "\"roughness\":0.65,\"metalness\":0.00,\"tileSizeMm\":551,"
								+ "\"displayOrder\":1}"))
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", "/api/v1/admin/desk-textures/3"))
				.andExpect(jsonPath("$.albedoKey").doesNotExist());
	}

	@Test
	@DisplayName("baseColor가 #RRGGBB 표기가 아니면 400 검증 실패다")
	void 등록_색상표기_검증_실패() throws Exception {
		mockMvc.perform(post("/api/v1/admin/desk-textures")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"월넛\",\"baseColor\":\"6B4A2F\","
								+ "\"roughness\":0.65,\"metalness\":0.00}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("맵 key 등록은 별도 엔드포인트가 아니라 PATCH 본문이다 → 200")
	void 맵_key_등록은_PATCH다() throws Exception {
		given(adminDeskTextureService.update(eq(3L), any())).willReturn(new DeskTextureResponse(
				3L, "월넛", "#6B4A2F", "desk-textures/3/albedo-uuid.ktx2", null, null,
				new BigDecimal("0.65"), new BigDecimal("0.00"), 551, 1));

		mockMvc.perform(patch("/api/v1/admin/desk-textures/{deskTextureId}", 3L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"albedoKey\":\"desk-textures/3/albedo-uuid.ktx2\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.albedoKey").value("desk-textures/3/albedo-uuid.ktx2"));
	}

	@Test
	@DisplayName("삭제는 204다 — 기존 배치의 참조를 지키려고 소프트 삭제라 게이트가 없다")
	void 삭제_성공() throws Exception {
		mockMvc.perform(delete("/api/v1/admin/desk-textures/{deskTextureId}", 3L))
				.andExpect(status().isNoContent());
	}

	@Test
	@DisplayName("맵 presign은 200 + 요청한 종류만큼의 maps를 반환한다")
	void 맵_발급_성공() throws Exception {
		given(adminDeskTextureService.presignMapUploads(eq(3L), any())).willReturn(
				new DeskTextureMapUploadUrlResponse(List.of(
						new DeskTextureMapUploadUrlResponse.MapUploadUrl(TextureMapKind.ALBEDO,
								"desk-textures/3/albedo-uuid.ktx2", "https://s3/put?sig1"),
						new DeskTextureMapUploadUrlResponse.MapUploadUrl(TextureMapKind.NORMAL,
								"desk-textures/3/normal-uuid.ktx2", "https://s3/put?sig2"))));

		mockMvc.perform(post("/api/v1/admin/desk-textures/{deskTextureId}/map-upload-urls", 3L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"kinds\":[\"ALBEDO\",\"NORMAL\"]}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.maps.length()").value(2))
				.andExpect(jsonPath("$.maps[0].kind").value("ALBEDO"))
				.andExpect(jsonPath("$.maps[0].key").value("desk-textures/3/albedo-uuid.ktx2"))
				.andExpect(jsonPath("$.maps[1].uploadUrl").value("https://s3/put?sig2"));
	}

	@Test
	@DisplayName("kinds가 비어 있으면 400 검증 실패다")
	void 맵_발급_빈_목록_거부() throws Exception {
		mockMvc.perform(post("/api/v1/admin/desk-textures/{deskTextureId}/map-upload-urls", 3L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"kinds\":[]}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	@DisplayName("없는 재질에 맵 발급을 요청하면 404 CATALOG_DESK_TEXTURE_NOT_FOUND다")
	void 맵_발급_재질_없음() throws Exception {
		given(adminDeskTextureService.presignMapUploads(eq(999L), any())).willThrow(
				new BusinessException(CatalogErrorCode.CATALOG_DESK_TEXTURE_NOT_FOUND));

		mockMvc.perform(post("/api/v1/admin/desk-textures/{deskTextureId}/map-upload-urls", 999L)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"kinds\":[\"ALBEDO\"]}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("CATALOG_DESK_TEXTURE_NOT_FOUND"));
	}
}
