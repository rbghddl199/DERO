package com.brunchies.dero.placement.controller;

import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.dto.PlacementDetailResponse;
import com.brunchies.dero.placement.dto.PlacementSaveResponse;
import com.brunchies.dero.placement.dto.PlacementSnapshotRequest;
import com.brunchies.dero.placement.dto.PlacementSummaryResponse;
import com.brunchies.dero.placement.dto.ThumbnailRegisterRequest;
import com.brunchies.dero.placement.dto.ThumbnailUploadUrlResponse;
import com.brunchies.dero.placement.service.PlacementService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
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
 * 배치 저장·상세·삭제·썸네일({@code docs/context/api-spec.md} §4).
 *
 * <p><b>상세의 🔓는 "선택적 인증"이지 "무조건 공개"가 아니다</b> — 비로그인은 {@code PUBLIC}만,
 * 로그인은 {@code PUBLIC} + 본인 소유 비공개까지 본다. 그래서 신원을 {@link AuthenticatedUserId}로
 * 꺼내 nullable로 서비스에 넘긴다: 익명 경로의 {@code Authentication}은 {@code null}이 아니라
 * {@code AnonymousAuthenticationToken}이라 {@code Long.valueOf(auth.getName())}은 500이 된다.
 *
 * <p>아이템 단위 엔드포인트를 만들지 않는다(§4) — {@code placed_item} 쓰기는 전부 스냅샷
 * {@code PUT}을 통과한다. {@code @Version}이 루트에만 있어 아이템 단위 쓰기는 충돌을 못 잡는다.
 */
@RestController
@RequestMapping("/api/v1/placements")
@RequiredArgsConstructor
public class PlacementController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final PlacementService placementService;
	private final SearchEventLogger searchEventLogger;

	/**
	 * 목록 → 200. 데스크 피드(공개 배치)와 내 작업실({@code ?owner=me})이 같은 엔드포인트다 —
	 * 부분집합은 전부 쿼리 파라미터이고 경로로 승격시키지 않는다(api-spec.md §1 규칙 3).
	 *
	 * <p><b>비로그인도 200이다</b> — 다만 보이는 범위가 {@code PUBLIC}으로 좁아진다. 401로 막으면
	 * D14가 허용한 비로그인 커뮤니티 열람이 통째로 닫힌다.
	 *
	 * <p><b>{@code ?bookmarked=me}는 342가 임시로 팠던 {@code GET /bookmarks}를 흡수한 것이다</b> —
	 * 부분집합은 전부 쿼리 파라미터라는 같은 규칙이고, 그 경로는 이 티켓에서 지웠다.
	 * {@code ?bookmarkGroup}은 숫자 또는 {@code none}(그룹 미지정)이며 {@code bookmarked=me} 없이
	 * 단독으로 오면 400이다.
	 *
	 * <p>{@code sort}는 {@code String}으로 받아 {@link PlacementSort#from}이 푼다 — 스프링 기본 enum
	 * 바인딩은 대소문자를 가려 명세의 {@code ?sort=latest}가 그대로는 안 붙는다. 반대로
	 * {@code publishStatus}는 명세가 대문자 그대로라 enum 바인딩에 맡긴다(모르는 값은
	 * {@code GlobalExceptionHandler.handleTypeMismatch}가 400으로 낸다).
	 *
	 * <p><b>{@code hashtag}는 태그 이름 하나와 정확히 일치하는 배치만 남긴다</b>(DERO-493,
	 * {@code GET /posts?hashtag=}와 같은 규약) — {@code '#'} 없이 이름만 보낸다. 데스크 피드의 태그 칩이
	 * 이 파라미터를 쓴다: 받아 온 페이지 안에서 거르면 커서 너머의 배치를 못 찾는다.
	 *
	 * <p>{@code size}는 {@code ProductController}와 같은 이유로 어노테이션 검증 대신 여기서 [1, 100]
	 * 사이로 자른다.
	 */
	@GetMapping
	public ResponseEntity<CursorPage<PlacementSummaryResponse>> list(
			Authentication authentication,
			@RequestParam(required = false) String owner,
			@RequestParam(required = false) PublishStatus publishStatus,
			@RequestParam(required = false) List<Long> ids,
			@RequestParam(required = false) String hashtag,
			@RequestParam(required = false) String bookmarked,
			@RequestParam(required = false) String bookmarkGroup,
			@RequestParam(required = false) String sort,
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		Long viewerId = AuthenticatedUserId.orNull(authentication);
		CursorPage<PlacementSummaryResponse> page = placementService.list(viewerId, owner,
				publishStatus, ids, hashtag, bookmarked, bookmarkGroup, PlacementSort.from(sort), q,
				cursor, effectiveSize);

		if (q != null && !q.isBlank() && cursor == null) {
			searchEventLogger.searched(SearchIndex.PLACEMENTS, q, page.totalCount(), viewerId);
		}
		return ResponseEntity.ok(page);
	}

	/** 신규 저장 → 201 + {@code Location}(ADR-0009 결정 6). */
	@PostMapping
	public ResponseEntity<PlacementSaveResponse> create(
			Authentication authentication,
			@Valid @RequestBody PlacementSnapshotRequest request) {
		PlacementSaveResponse response =
				placementService.create(AuthenticatedUserId.orNull(authentication), request);
		return ResponseEntity
				.created(URI.create("/api/v1/placements/" + response.id()))
				.body(response);
	}

	/** 상세 — 저장한 스냅샷을 그대로 복원한다. 볼 수 없는 배치는 404다. */
	@GetMapping("/{placementId}")
	public ResponseEntity<PlacementDetailResponse> get(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(
				placementService.get(placementId, AuthenticatedUserId.orNull(authentication)));
	}

	/**
	 * 기존 저장 → 200. 스냅샷 <b>전체 교체</b>(id 매칭 병합)라 {@code PATCH}가 아니라 {@code PUT}이다.
	 * 요청의 {@code version}이 현재와 다르면 409 {@code PLACEMENT_STALE}이고 아무것도 쓰지 않는다.
	 */
	@PutMapping("/{placementId}")
	public ResponseEntity<PlacementSaveResponse> update(
			Authentication authentication,
			@PathVariable Long placementId,
			@Valid @RequestBody PlacementSnapshotRequest request) {
		return ResponseEntity.ok(placementService.update(
				AuthenticatedUserId.orNull(authentication), placementId, request));
	}

	/** 삭제 → 204. 남의 배치를 지우려 하면 404다. */
	@DeleteMapping("/{placementId}")
	public ResponseEntity<Void> delete(
			Authentication authentication, @PathVariable Long placementId) {
		placementService.delete(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 리믹스 → 201 + {@code Location}(새 배치). <b>본문이 없다</b> — 출처는 경로가 말하고 그 밖의
	 * 입력은 없다. 요청 본문의 출처 값을 읽지 않는 것이 이 엔드포인트의 요점이다(클라이언트 자기
	 * 신고는 위조할 수 있다).
	 *
	 * <p>응답 본문은 새 배치의 상세다 — 성공 직후 시뮬레이터 편집 화면이 바로 그릴 수 있어야 해서
	 * {@code Location}만 주고 한 번 더 왕복시키지 않는다.
	 */
	@PostMapping("/{placementId}/remixes")
	public ResponseEntity<PlacementDetailResponse> remix(
			Authentication authentication, @PathVariable Long placementId) {
		PlacementDetailResponse response =
				placementService.remix(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity
				.created(URI.create("/api/v1/placements/" + response.id()))
				.body(response);
	}

	/**
	 * 이 배치를 리믹스한 것들 → 200. <b>비로그인도 200이다</b>(목록·상세와 같은 선택적 인증) —
	 * 다만 가시성 규칙이 그대로 걸려 남의 비공개 리믹스는 안 보인다.
	 */
	@GetMapping("/{placementId}/remixes")
	public ResponseEntity<CursorPage<PlacementSummaryResponse>> listRemixes(
			Authentication authentication,
			@PathVariable Long placementId,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(placementService.listRemixes(
				AuthenticatedUserId.orNull(authentication), placementId, cursor, effectiveSize));
	}

	/** 썸네일 1단계 — presigned PUT URL 발급. 저장하는 게 없어 201이 아니라 200이다(§1 규칙 1). */
	@PostMapping("/{placementId}/thumbnail/upload-url")
	public ResponseEntity<ThumbnailUploadUrlResponse> presignThumbnailUpload(
			Authentication authentication, @PathVariable Long placementId) {
		return ResponseEntity.ok(placementService.presignThumbnailUpload(
				AuthenticatedUserId.orNull(authentication), placementId));
	}

	/** 썸네일 2단계 — 업로드한 key 등록 → 204. 멱등이고 재등록은 덮어쓴다. */
	@PutMapping("/{placementId}/thumbnail")
	public ResponseEntity<Void> registerThumbnail(
			Authentication authentication,
			@PathVariable Long placementId,
			@Valid @RequestBody ThumbnailRegisterRequest request) {
		placementService.registerThumbnail(
				AuthenticatedUserId.orNull(authentication), placementId, request);
		return ResponseEntity.noContent().build();
	}
}
