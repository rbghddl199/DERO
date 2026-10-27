package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.DeskFeedImageProductsRequest;
import com.brunchies.dero.community.dto.DeskFeedImageRegisterRequest;
import com.brunchies.dero.community.dto.DeskFeedImageResponse;
import com.brunchies.dero.community.dto.DeskFeedImageUploadUrlsRequest;
import com.brunchies.dero.community.dto.DeskFeedImageUploadUrlsResponse;
import com.brunchies.dero.community.service.DeskFeedService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 데스크피드 사진 presign 2단계(api-spec.md §6-보 — post 이미지와 같은 관례). 전부 🔒 —
 * {@code SecurityConfig}의 데스크피드 permitAll은 {@code GET} 한정이라 여기는 기본값
 * {@code authenticated()}다.
 *
 * <p>①{@code POST .../images/upload-urls}로 presigned PUT URL을 받고 ②브라우저가 스토리지에 직접
 * PUT한 뒤 ③{@code POST .../images}로 key를 등록하고, 필요하면 ④{@code DELETE .../images/{imageId}}로
 * 지운다 — <b>{@code PostImageController}와 같은 4개 계약이다</b>(D34·ADR-0037: ADR-0036이 잠시
 * 되살렸던 {@code PUT}의 전체 교체 모델을 재폐기했다).
 */
@RestController
@RequestMapping("/api/v1/desk-feeds/{deskFeedId}/images")
@RequiredArgsConstructor
public class DeskFeedImageController {

	private final DeskFeedService deskFeedService;

	/** 1단계 — presigned PUT 발급 → 200(저장하는 것이 없다, api-spec.md §1 규칙 1). */
	@PostMapping("/upload-urls")
	public ResponseEntity<DeskFeedImageUploadUrlsResponse> presignUploads(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@Valid @RequestBody DeskFeedImageUploadUrlsRequest request) {
		return ResponseEntity.ok(deskFeedService.presignImageUploads(
				AuthenticatedUserId.orNull(authentication), deskFeedId, request));
	}

	/** 2단계 — 업로드 끝난 key 등록 → 201. 순서·대표는 본문 마크다운이 정한다. */
	@PostMapping
	public ResponseEntity<DeskFeedImageResponse> register(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@Valid @RequestBody DeskFeedImageRegisterRequest request) {
		DeskFeedImageResponse response = deskFeedService.registerImage(
				AuthenticatedUserId.orNull(authentication), deskFeedId, request);
		return ResponseEntity
				.created(URI.create(
						"/api/v1/desk-feeds/" + deskFeedId + "/images/" + response.id()))
				.body(response);
	}

	/**
	 * 사진 한 장의 제품 태그 전체 교체 → 200(D37 개정·ADR-0040). 빈 배열이 "태그 없음"이다.
	 * 글 단위 "사용된 제품" 목록 밖의 제품은 422다 — 상세 응답이 id만 실어 화면이 그 목록에서
	 * 이름·가격을 찾기 때문이다.
	 */
	@PutMapping("/{imageId}/products")
	public ResponseEntity<DeskFeedImageResponse> replaceProducts(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@PathVariable Long imageId,
			@Valid @RequestBody DeskFeedImageProductsRequest request) {
		return ResponseEntity.ok(deskFeedService.replaceImageProducts(
				AuthenticatedUserId.orNull(authentication), deskFeedId, imageId,
				request.productIdsOrEmpty()));
	}

	/** 삭제 → 204. */
	@DeleteMapping("/{imageId}")
	public ResponseEntity<Void> delete(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@PathVariable Long imageId) {
		deskFeedService.deleteImage(
				AuthenticatedUserId.orNull(authentication), deskFeedId, imageId);
		return ResponseEntity.noContent().build();
	}
}
