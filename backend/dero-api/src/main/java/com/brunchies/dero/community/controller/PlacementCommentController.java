package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.community.dto.CommentResponse;
import com.brunchies.dero.community.service.CommentService;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 댓글({@code api-spec.md} §4, REQ-COM-06). {@code GET}만 🔓이고 나머지는 🔒.
 *
 * <p><b>{@code GET}의 🔓는 "선택적 인증"이다</b> — 비로그인은 {@code PUBLIC} 배치의 댓글만 읽고,
 * 안 보이는 배치는 404다. {@code SecurityConfig}의 {@code /api/v1/placements/*} permitAll은 한
 * 세그먼트만 매치해 이 경로를 안 열기 때문에 <b>규칙 한 줄이 따로 붙어 있다.</b>
 *
 * <p>익명 경로의 {@code Authentication}은 {@code null}이 아니라 {@code AnonymousAuthenticationToken}
 * 이라 {@link AuthenticatedUserId}를 반드시 통과시킨다.
 */
@RestController
@RequestMapping("/api/v1/placements/{placementId}/comments")
@RequiredArgsConstructor
public class PlacementCommentController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final CommentService commentService;

	/**
	 * 등록순 커서 목록. {@code size}는 어노테이션 검증 대신 여기서 [1, 100] 사이로 자른다 —
	 * 목록 크기는 거절할 입력이 아니라 서버가 정하는 상한이다.
	 */
	@GetMapping
	public ResponseEntity<CursorPage<CommentResponse>> list(
			Authentication authentication,
			@PathVariable Long placementId,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(commentService.list(
				AuthenticatedUserId.orNull(authentication), placementId, cursor, effectiveSize));
	}

	/** 작성 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<CommentResponse> create(
			Authentication authentication,
			@PathVariable Long placementId,
			@Valid @RequestBody CommentCreateRequest request) {
		CommentResponse response = commentService.create(
				AuthenticatedUserId.orNull(authentication), placementId, request);
		return ResponseEntity
				.created(URI.create(
						"/api/v1/placements/" + placementId + "/comments/" + response.id()))
				.body(response);
	}

	/** 삭제 → 204. <b>남의 댓글은 403이다</b>(404가 아니다 — 이미 본문까지 보이므로 숨길 것이 없다). */
	@DeleteMapping("/{commentId}")
	public ResponseEntity<Void> delete(
			Authentication authentication,
			@PathVariable Long placementId,
			@PathVariable Long commentId) {
		commentService.delete(AuthenticatedUserId.orNull(authentication), placementId, commentId);
		return ResponseEntity.noContent().build();
	}
}
