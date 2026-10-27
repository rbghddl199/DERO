package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.VesaSpecCreateRequest;
import com.brunchies.dero.catalog.dto.VesaSpecPatchRequest;
import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.catalog.service.AdminVesaSpecService;
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
 * 운영진 VESA 규격 마스터 관리(api-spec §9 마스터 6종). 배치·권한 판단은
 * {@code AdminBrandController} javadoc 참조.
 *
 * <p>경로가 {@code /vesa-specs}다 — 케밥 케이스가 이 API의 복수 단어 경로 규약이다
 * ({@code /desk-textures}·{@code /upload-urls}와 같은 결).
 */
@RestController
@RequestMapping("/api/v1/admin/vesa-specs")
@RequiredArgsConstructor
public class AdminVesaSpecController {

	private final AdminVesaSpecService adminVesaSpecService;

	/** 목록(offset). */
	@GetMapping
	public ResponseEntity<OffsetPage<VesaSpecResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminVesaSpecService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. 같은 홀 간격 쌍이 이미 있으면 409다. */
	@PostMapping
	public ResponseEntity<VesaSpecResponse> create(
			@Valid @RequestBody VesaSpecCreateRequest request) {
		VesaSpecResponse response = adminVesaSpecService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/vesa-specs/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. */
	@PatchMapping("/{vesaSpecId}")
	public ResponseEntity<VesaSpecResponse> update(
			@PathVariable Long vesaSpecId,
			@Valid @RequestBody VesaSpecPatchRequest request) {
		return ResponseEntity.ok(adminVesaSpecService.update(vesaSpecId, request));
	}

	/** 삭제(soft delete) → 204. 정션이 CASCADE라 삭제 게이트가 없다. */
	@DeleteMapping("/{vesaSpecId}")
	public ResponseEntity<Void> delete(@PathVariable Long vesaSpecId) {
		adminVesaSpecService.delete(vesaSpecId);
		return ResponseEntity.noContent().build();
	}
}
