package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.HashtagCreateRequest;
import com.brunchies.dero.catalog.dto.HashtagPatchRequest;
import com.brunchies.dero.catalog.dto.HashtagResponse;
import com.brunchies.dero.catalog.service.AdminHashtagService;
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
 * 운영진 해시태그 마스터 관리(api-spec §9 마스터 6종). 배치·권한 판단은
 * {@code AdminBrandController} javadoc 참조.
 */
@RestController
@RequestMapping("/api/v1/admin/hashtags")
@RequiredArgsConstructor
public class AdminHashtagController {

	private final AdminHashtagService adminHashtagService;

	/** 목록(offset). */
	@GetMapping
	public ResponseEntity<OffsetPage<HashtagResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminHashtagService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. 같은 이름이 이미 있으면 409다. */
	@PostMapping
	public ResponseEntity<HashtagResponse> create(
			@Valid @RequestBody HashtagCreateRequest request) {
		HashtagResponse response = adminHashtagService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/hashtags/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. */
	@PatchMapping("/{hashtagId}")
	public ResponseEntity<HashtagResponse> update(
			@PathVariable Long hashtagId,
			@Valid @RequestBody HashtagPatchRequest request) {
		return ResponseEntity.ok(adminHashtagService.update(hashtagId, request));
	}

	/** 삭제(soft delete) → 204. 정션이 CASCADE라 삭제 게이트가 없다. */
	@DeleteMapping("/{hashtagId}")
	public ResponseEntity<Void> delete(@PathVariable Long hashtagId) {
		adminHashtagService.delete(hashtagId);
		return ResponseEntity.noContent().build();
	}
}
