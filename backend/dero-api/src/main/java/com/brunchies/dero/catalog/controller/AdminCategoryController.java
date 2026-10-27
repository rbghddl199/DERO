package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.CategoryCreateRequest;
import com.brunchies.dero.catalog.dto.CategoryPatchRequest;
import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.service.AdminCategoryService;
import com.brunchies.dero.global.response.OffsetPage;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 운영진 카테고리 마스터 관리(api-spec §9 마스터 6종). 배치·권한 판단은
 * {@code AdminBrandController} javadoc 참조.
 */
@RestController
@RequestMapping("/api/v1/admin/categories")
@RequiredArgsConstructor
public class AdminCategoryController {

	private final AdminCategoryService adminCategoryService;

	/** 목록(offset). 트리를 펼치지 않고 {@code parentId}만 실어 내린다. */
	@GetMapping
	public ResponseEntity<OffsetPage<CategoryResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminCategoryService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. {@code parentId}가 없으면 루트다. */
	@PostMapping
	public ResponseEntity<CategoryResponse> create(
			@Valid @RequestBody CategoryCreateRequest request) {
		CategoryResponse response = adminCategoryService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/categories/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. 자기 자신·하위 트리를 부모로 지정하면 422다. */
	@PatchMapping("/{categoryId}")
	public ResponseEntity<CategoryResponse> update(
			@PathVariable Long categoryId,
			@Valid @RequestBody CategoryPatchRequest request) {
		return ResponseEntity.ok(adminCategoryService.update(categoryId, request));
	}

	/** 삭제(soft delete) → 204. 참조 중인 제품 또는 살아 있는 자식이 있으면 409다. */
	@DeleteMapping("/{categoryId}")
	public ResponseEntity<Void> delete(@PathVariable Long categoryId) {
		adminCategoryService.delete(categoryId);
		return ResponseEntity.noContent().build();
	}
}
