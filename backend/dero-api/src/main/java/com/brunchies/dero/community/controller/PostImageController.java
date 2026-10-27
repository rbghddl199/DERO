package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.PostImageRegisterRequest;
import com.brunchies.dero.community.dto.PostImageResponse;
import com.brunchies.dero.community.dto.PostImageUploadUrlsRequest;
import com.brunchies.dero.community.dto.PostImageUploadUrlsResponse;
import com.brunchies.dero.community.service.PostService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게시글 사진 2단계 presign({@code api-spec.md} §6, ADR-0013 결정 8) — 전부 🔒 작성자 본인만.
 *
 * <p>①{@code POST .../images/upload-urls}로 presigned PUT URL을 받고 ②브라우저가 스토리지에 직접
 * PUT한 뒤 ③{@code POST .../images}로 key를 등록한다. <b>파일 바이트가 WAS를 거치지 않는다</b> —
 * 배치 썸네일({@code PlacementController})과 같은 형태다.
 *
 * <p>컨트롤러를 {@link PostController}와 나눈 이유는 경로 접두사가 다르기 때문일 뿐이고, 서비스는
 * {@link PostService} 하나다 — 사진은 {@code Post} 애그리거트 <b>안</b>이라 쓰기가 루트를 통과해야
 * 한다(ADR-0011 결정 8, {@code PostImageRepository}가 없다).
 */
@RestController
@RequestMapping("/api/v1/posts/{postId}/images")
@RequiredArgsConstructor
public class PostImageController {

	private final PostService postService;

	/** 1단계 — presigned PUT URL 발급. 저장하는 게 없어 201이 아니라 200이다(§1 규칙 1). */
	@PostMapping("/upload-urls")
	public ResponseEntity<PostImageUploadUrlsResponse> presignUploads(
			Authentication authentication,
			@PathVariable Long postId,
			@Valid @RequestBody PostImageUploadUrlsRequest request) {
		return ResponseEntity.ok(postService.presignImageUploads(
				AuthenticatedUserId.orNull(authentication), postId, request));
	}

	/** 2단계 — 업로드한 key 등록 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<PostImageResponse> register(
			Authentication authentication,
			@PathVariable Long postId,
			@Valid @RequestBody PostImageRegisterRequest request) {
		PostImageResponse response = postService.registerImage(
				AuthenticatedUserId.orNull(authentication), postId, request);
		return ResponseEntity
				.created(URI.create("/api/v1/posts/" + postId + "/images/" + response.id()))
				.body(response);
	}

	/** 삭제 → 204. */
	@DeleteMapping("/{imageId}")
	public ResponseEntity<Void> delete(
			Authentication authentication,
			@PathVariable Long postId,
			@PathVariable Long imageId) {
		postService.deleteImage(AuthenticatedUserId.orNull(authentication), postId, imageId);
		return ResponseEntity.noContent().build();
	}
}
