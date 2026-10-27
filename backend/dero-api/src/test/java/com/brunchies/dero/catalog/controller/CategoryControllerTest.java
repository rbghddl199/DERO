package com.brunchies.dero.catalog.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.service.CategoryService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** 공개 카테고리 목록(`GET /api/v1/categories`) — 응답 모양만 검증한다. 무인증 통과는 {@code SecurityProblemDetailTest}가 맡는다. */
@WebMvcTest(controllers = CategoryController.class)
@AutoConfigureMockMvc(addFilters = false)
class CategoryControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private CategoryService categoryService;

	@Test
	@DisplayName("루트·자식이 섞인 평평한 목록을 그대로 내려준다 — parentId로 트리를 표현한다")
	void 목록_조회() throws Exception {
		given(categoryService.list()).willReturn(List.of(
				new CategoryResponse(1L, null, "모니터", "화면 장치", 1),
				new CategoryResponse(2L, 1L, "27인치", null, 0)));

		mockMvc.perform(get("/api/v1/categories"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].id").value(1))
				.andExpect(jsonPath("$[0].parentId").doesNotExist())
				.andExpect(jsonPath("$[1].id").value(2))
				.andExpect(jsonPath("$[1].parentId").value(1));
	}

	@Test
	@DisplayName("카테고리가 하나도 없으면 빈 배열이다")
	void 목록_비어있음() throws Exception {
		given(categoryService.list()).willReturn(List.of());

		mockMvc.perform(get("/api/v1/categories"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}
}
