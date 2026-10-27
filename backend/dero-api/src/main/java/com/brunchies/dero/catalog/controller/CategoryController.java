package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.service.CategoryService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공개 카테고리 목록(`GET /api/v1/categories`, DERO-325) — 비로그인 포함 누구나 본다(탐색·필터
 * 트리는 로그인 전에도 필요하다). 지금 루트 9개·자식 0개뿐이라 페이지네이션 없이 평평한 배열 하나로
 * 내린다 — 트리 조립은 프론트가 {@code parentId}로 한다.
 */
@RestController
@RequestMapping("/api/v1/categories")
@RequiredArgsConstructor
public class CategoryController {

	private final CategoryService categoryService;

	@GetMapping
	public ResponseEntity<List<CategoryResponse>> list() {
		return ResponseEntity.ok(categoryService.list());
	}
}
