package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.VibeCreateRequest;
import com.brunchies.dero.catalog.dto.VibePatchRequest;
import com.brunchies.dero.catalog.dto.VibeResponse;
import com.brunchies.dero.catalog.service.AdminVibeService;
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
 * 운영진 분위기 태그 마스터 관리(api-spec §9 마스터 6종). 배치·권한 판단은
 * {@code AdminBrandController} javadoc 참조.
 */
@RestController
@RequestMapping("/api/v1/admin/vibes")
@RequiredArgsConstructor
public class AdminVibeController {

	private final AdminVibeService adminVibeService;

	/** 목록(offset). */
	@GetMapping
	public ResponseEntity<OffsetPage<VibeResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminVibeService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. 같은 이름이 이미 있으면 409다. */
	@PostMapping
	public ResponseEntity<VibeResponse> create(@Valid @RequestBody VibeCreateRequest request) {
		VibeResponse response = adminVibeService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/vibes/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. */
	@PatchMapping("/{vibeId}")
	public ResponseEntity<VibeResponse> update(
			@PathVariable Long vibeId,
			@Valid @RequestBody VibePatchRequest request) {
		return ResponseEntity.ok(adminVibeService.update(vibeId, request));
	}

	/** 삭제(soft delete) → 204. 정션이 CASCADE라 삭제 게이트가 없다. */
	@DeleteMapping("/{vibeId}")
	public ResponseEntity<Void> delete(@PathVariable Long vibeId) {
		adminVibeService.delete(vibeId);
		return ResponseEntity.noContent().build();
	}
}
