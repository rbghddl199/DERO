package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.PostDetailResponse;
import com.brunchies.dero.community.dto.PostSaveRequest;
import com.brunchies.dero.community.dto.PostSummaryResponse;
import com.brunchies.dero.community.service.PostService;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
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
 * 게시글 목록·작성·상세·수정·삭제({@code docs/context/api-spec.md} §6, REQ-COM-12).
 *
 * <p><b>배치 참조 엔드포인트가 없다</b>(ADR-0013) — 참조는 본문 {@code content} 안의
 * {@code [[placement:ID]]} 토큰이 전부다. 프론트는 그 토큰의 id들을
 * {@code GET /placements?ids=…} <b>한 번</b>으로 가져온다.
 *
 * <p>{@code GET} 둘은 🔓다. 게시글에는 배치 같은 게시 상태가 없어 신원으로 좁힐 범위가 없다 —
 * 다만 {@code ?owner=me}를 풀려면 신원이 필요해서 목록만 {@link AuthenticatedUserId}를 통과시킨다.
 * 익명 경로의 {@code Authentication}은 {@code null}이 아니라 {@code AnonymousAuthenticationToken}
 * 이라 반드시 그 헬퍼를 거쳐야 한다.
 */
@RestController
@RequestMapping("/api/v1/posts")
@RequiredArgsConstructor
public class PostController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final PostService postService;
	private final SearchEventLogger searchEventLogger;

	/**
	 * 목록 → 200. <b>비로그인도 200이다</b> — 401로 막으면 D14가 허용한 비로그인 커뮤니티 열람이
	 * 통째로 닫힌다.
	 *
	 * <p>{@code size}는 어노테이션 검증 대신 여기서 [1, 100] 사이로 자른다 — 목록 크기는 거절할
	 * 입력이 아니라 서버가 정하는 상한이다({@code PlacementController}와 같은 이유).
	 *
	 * <p><b>{@code q}는 서버 검색이다</b>(ADR-0027) — 제목·본문·태그·작성자를 ES가 관련도 순으로 찾고
	 * 본문은 Postgres에서 읽는다. {@code hashtag}·{@code owner} 필터와 <b>같이</b> 걸리고, {@code q}가
	 * 없으면 지금까지의 최신순 목록 그대로다.
	 *
	 * <p><b>{@code q}가 실린 요청은 검색어 이벤트를 하나 남긴다</b>(ADR-0020 결정 7 —
	 * {@link SearchEventLogger}). 여기가 그 자리인 이유는 <b>결과 건수가 노출 규칙까지 적용된 뒤의
	 * 값이어야 하기 때문</b>이다(0건 검색어 = 커뮤니티에 없는 이야기 목록) — 서비스 안쪽 ES 히트 수는
	 * 지워진 글을 아직 포함한다. <b>첫 페이지에서만 남긴다</b>: 이벤트 하나가 "검색 한 번"이라 스크롤로
	 * 다음 페이지를 받을 때마다 남기면 인기 검색어 순위가 스크롤 길이를 반영한다.
	 */
	@GetMapping
	public ResponseEntity<CursorPage<PostSummaryResponse>> list(
			Authentication authentication,
			@RequestParam(required = false) String hashtag,
			@RequestParam(required = false) String owner,
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		Long viewerId = AuthenticatedUserId.orNull(authentication);
		CursorPage<PostSummaryResponse> page =
				postService.list(viewerId, hashtag, owner, q, cursor, effectiveSize);

		if (q != null && !q.isBlank() && cursor == null) {
			searchEventLogger.searched(SearchIndex.POSTS, q, page.totalCount(), viewerId);
		}
		return ResponseEntity.ok(page);
	}

	/** 작성 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<PostDetailResponse> create(
			Authentication authentication, @Valid @RequestBody PostSaveRequest request) {
		PostDetailResponse response =
				postService.create(AuthenticatedUserId.orNull(authentication), request);
		return ResponseEntity
				.created(URI.create("/api/v1/posts/" + response.id()))
				.body(response);
	}

	/** 상세 → 200. 지워진 글은 404다. */
	@GetMapping("/{postId}")
	public ResponseEntity<PostDetailResponse> get(@PathVariable Long postId) {
		return ResponseEntity.ok(postService.get(postId));
	}

	/** 수정 → 200. 제목·본문·태그 <b>전체 교체</b>라 {@code PATCH}가 아니다. 남의 글은 403이다. */
	@PutMapping("/{postId}")
	public ResponseEntity<PostDetailResponse> update(
			Authentication authentication,
			@PathVariable Long postId,
			@Valid @RequestBody PostSaveRequest request) {
		return ResponseEntity.ok(postService.update(
				AuthenticatedUserId.orNull(authentication), postId, request));
	}

	/** 삭제 → 204. 남의 글은 403이다. */
	@DeleteMapping("/{postId}")
	public ResponseEntity<Void> delete(
			Authentication authentication, @PathVariable Long postId) {
		postService.delete(AuthenticatedUserId.orNull(authentication), postId);
		return ResponseEntity.noContent().build();
	}
}
