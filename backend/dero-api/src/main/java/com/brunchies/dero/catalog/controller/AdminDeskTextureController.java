package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.DeskTextureCreateRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlResponse;
import com.brunchies.dero.catalog.dto.DeskTexturePatchRequest;
import com.brunchies.dero.catalog.dto.DeskTextureResponse;
import com.brunchies.dero.catalog.service.AdminDeskTextureService;
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
 * 운영진 상판 재질 마스터 관리(api-spec §9 마스터 6종). 배치·권한 판단은
 * {@code AdminBrandController} javadoc 참조.
 */
@RestController
@RequestMapping("/api/v1/admin/desk-textures")
@RequiredArgsConstructor
public class AdminDeskTextureController {

	private final AdminDeskTextureService adminDeskTextureService;

	/** 목록(offset). */
	@GetMapping
	public ResponseEntity<OffsetPage<DeskTextureResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminDeskTextureService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. 맵 key 3종은 아직 없다(업로드 후 PATCH). */
	@PostMapping
	public ResponseEntity<DeskTextureResponse> create(
			@Valid @RequestBody DeskTextureCreateRequest request) {
		DeskTextureResponse response = adminDeskTextureService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/desk-textures/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. <b>맵 key 3종의 등록 경로가 여기다</b> — 별도 등록 엔드포인트가 없다. */
	@PatchMapping("/{deskTextureId}")
	public ResponseEntity<DeskTextureResponse> update(
			@PathVariable Long deskTextureId,
			@Valid @RequestBody DeskTexturePatchRequest request) {
		return ResponseEntity.ok(adminDeskTextureService.update(deskTextureId, request));
	}

	/** 삭제(soft delete) → 204. 기존 배치의 참조를 지키려고 소프트 삭제라 게이트가 없다. */
	@DeleteMapping("/{deskTextureId}")
	public ResponseEntity<Void> delete(@PathVariable Long deskTextureId) {
		adminDeskTextureService.delete(deskTextureId);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 맵 presigned PUT URL 일괄 발급 → 200. 저장하는 게 없어 201이 아니다(§1 규칙 1⑵).
	 *
	 * <p>경로가 복수형({@code map-upload-urls})인 것은 한 번에 여러 종류를 발급하기 때문이다 —
	 * 제품 실사 이미지의 {@code /images/upload-urls}와 같은 결이다.
	 */
	@PostMapping("/{deskTextureId}/map-upload-urls")
	public ResponseEntity<DeskTextureMapUploadUrlResponse> presignMapUploads(
			@PathVariable Long deskTextureId,
			@Valid @RequestBody DeskTextureMapUploadUrlRequest request) {
		return ResponseEntity.ok(
				adminDeskTextureService.presignMapUploads(deskTextureId, request));
	}
}
