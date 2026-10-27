package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.community.dto.DeskFeedCommentResponse;
import com.brunchies.dero.community.service.DeskFeedCommentService;
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
 * 데스크피드 댓글(api-spec.md §6-보, REQ-COM-16) — {@code GET}만 🔓이고 나머지는 🔒. post 댓글과
 * 달리 <b>처음부터 실영속이다</b>(마커 시절 세션 메모리 댓글의 처방, ADR-0033 결함 4).
 *
 * <p>{@code SecurityConfig}의 데스크피드 permitAll은 {@code *}가 한 세그먼트만 매치해 이 경로를 안
 * 열므로 규칙 한 줄이 따로 붙는다(배치 댓글 경로와 같은 자리).
 */
@RestController
@RequestMapping("/api/v1/desk-feeds/{deskFeedId}/comments")
@RequiredArgsConstructor
public class DeskFeedCommentController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final DeskFeedCommentService deskFeedCommentService;

	/** 최신순 커서 목록 → 200. 비로그인도 본다. {@code size}는 [1, 100]으로 자른다. */
	@GetMapping
	public ResponseEntity<CursorPage<DeskFeedCommentResponse>> list(
			@PathVariable Long deskFeedId,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(
				deskFeedCommentService.list(deskFeedId, cursor, effectiveSize));
	}

	/** 작성 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<DeskFeedCommentResponse> create(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@Valid @RequestBody CommentCreateRequest request) {
		DeskFeedCommentResponse response = deskFeedCommentService.create(
				AuthenticatedUserId.orNull(authentication), deskFeedId, request);
		return ResponseEntity
				.created(URI.create(
						"/api/v1/desk-feeds/" + deskFeedId + "/comments/" + response.id()))
				.body(response);
	}

	/** 삭제 → 204. <b>남의 댓글은 403이다</b>(404가 아니다 — 본문이 이미 보여 숨길 것이 없다). */
	@DeleteMapping("/{commentId}")
	public ResponseEntity<Void> delete(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@PathVariable Long commentId) {
		deskFeedCommentService.delete(
				AuthenticatedUserId.orNull(authentication), deskFeedId, commentId);
		return ResponseEntity.noContent().build();
	}
}
