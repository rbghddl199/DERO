package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.DeskFeedCreateRequest;
import com.brunchies.dero.community.dto.DeskFeedDetailResponse;
import com.brunchies.dero.community.dto.DeskFeedSummaryResponse;
import com.brunchies.dero.community.dto.DeskFeedUpdateRequest;
import com.brunchies.dero.community.service.DeskFeedService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 데스크피드 목록·작성·상세·수정·삭제(api-spec.md §6-보, REQ-COM-16·17, D32·ADR-0033).
 *
 * <p>{@code GET} 둘은 🔓다 — 게시 상태가 없어 신원으로 좁힐 범위가 없고, {@code ?owner=me}를 풀
 * 때만 신원이 필요해 목록이 {@link AuthenticatedUserId}를 통과시킨다({@code PostController}와 같은
 * 자리). <b>검색({@code ?q=})은 없다</b> — ES 색인은 후속이다(ADR-0033 결정 6).
 *
 * <p>{@code ?placementId}가 역방향 조회("이 배치의 실사 사진")다 — 컬렉션 배치 상세의 실사 사진
 * 섹션이 이 파라미터 하나로 성립한다(ADR-0033 결정 4: 데스크피드 글만 노출).
 */
@RestController
@RequestMapping("/api/v1/desk-feeds")
@RequiredArgsConstructor
public class DeskFeedController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final DeskFeedService deskFeedService;

	/**
	 * 목록 → 200. {@code size}는 어노테이션 검증 대신 여기서 [1, 100] 사이로 자른다 — 목록 크기는
	 * 거절할 입력이 아니라 서버가 정하는 상한이다({@code PostController}와 같은 이유).
	 */
	@GetMapping
	public ResponseEntity<CursorPage<DeskFeedSummaryResponse>> list(
			Authentication authentication,
			@RequestParam(required = false) String hashtag,
			@RequestParam(required = false) String owner,
			@RequestParam(required = false) Long placementId,
			@RequestParam(required = false) String sort,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(deskFeedService.list(
				AuthenticatedUserId.orNull(authentication), hashtag, owner, placementId, sort,
				cursor, effectiveSize));
	}

	/** 작성 → 201 + {@code Location}. 사진은 presign 2단계가 작성 후 등록한다. */
	@PostMapping
	public ResponseEntity<DeskFeedDetailResponse> create(
			Authentication authentication, @Valid @RequestBody DeskFeedCreateRequest request) {
		DeskFeedDetailResponse response =
				deskFeedService.create(AuthenticatedUserId.orNull(authentication), request);
		return ResponseEntity
				.created(URI.create("/api/v1/desk-feeds/" + response.id()))
				.body(response);
	}

	/**
	 * 상세 → 200. 지워진 글은 404다. <b>사진 0장 글(작성 → 업로드 사이)은 작성자 본인 외
	 * 404다</b> — 본인 판별에만 신원을 쓰므로 🔓는 그대로다.
	 */
	@GetMapping("/{deskFeedId}")
	public ResponseEntity<DeskFeedDetailResponse> get(
			Authentication authentication, @PathVariable Long deskFeedId) {
		return ResponseEntity.ok(
				deskFeedService.get(AuthenticatedUserId.orNull(authentication), deskFeedId));
	}

	/**
	 * 수정 → 200. <b>제목·본문·태그·배치 첨부/해제 전체 교체라 {@code PATCH}가 아니다</b>. 사진은
	 * 이미지 엔드포인트가 관리한다({@code PostController}와 동형). 남의 글은 403이다.
	 */
	@PutMapping("/{deskFeedId}")
	public ResponseEntity<DeskFeedDetailResponse> update(
			Authentication authentication,
			@PathVariable Long deskFeedId,
			@Valid @RequestBody DeskFeedUpdateRequest request) {
		return ResponseEntity.ok(deskFeedService.update(
				AuthenticatedUserId.orNull(authentication), deskFeedId, request));
	}

	/** 삭제 → 204. 남의 글은 403이다. */
	@DeleteMapping("/{deskFeedId}")
	public ResponseEntity<Void> delete(
			Authentication authentication, @PathVariable Long deskFeedId) {
		deskFeedService.delete(AuthenticatedUserId.orNull(authentication), deskFeedId);
		return ResponseEntity.noContent().build();
	}
}
