package com.brunchies.dero.catalog.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.catalog.dto.DeskTexturePublicResponse;
import com.brunchies.dero.catalog.service.DeskTextureService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** 공개 상판 재질 목록(`GET /api/v1/desk-textures`) — 응답 모양만 검증한다. 무인증 통과는 {@code SecurityProblemDetailTest}가 맡는다. */
@WebMvcTest(controllers = DeskTextureController.class)
@AutoConfigureMockMvc(addFilters = false)
class DeskTextureControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private DeskTextureService deskTextureService;

	@Test
	@DisplayName("맵이 있는 재질은 presigned URL 3종을 그대로 내려준다")
	void 목록_조회() throws Exception {
		given(deskTextureService.list()).willReturn(List.of(new DeskTexturePublicResponse(
				1L, "오크", "#C9A876",
				"https://s3/get?albedo", "https://s3/get?roughness", "https://s3/get?normal",
				new BigDecimal("0.65"), new BigDecimal("0.00"), 551, 1)));

		mockMvc.perform(get("/api/v1/desk-textures"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].albedoUrl").value("https://s3/get?albedo"));
	}

	@Test
	@DisplayName("단색(도장) 재질은 맵 key가 없어 대응 URL도 null이다")
	void 목록_조회_단색_재질은_맵_URL이_null() throws Exception {
		given(deskTextureService.list()).willReturn(List.of(new DeskTexturePublicResponse(
				2L, "블랙", "#1A1A1A", null, null, null,
				new BigDecimal("0.80"), new BigDecimal("0.00"), null, 2)));

		mockMvc.perform(get("/api/v1/desk-textures"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].albedoUrl").doesNotExist())
				.andExpect(jsonPath("$[0].roughnessUrl").doesNotExist())
				.andExpect(jsonPath("$[0].normalUrl").doesNotExist())
				.andExpect(jsonPath("$[0].tileSizeMm").doesNotExist());
	}
}
