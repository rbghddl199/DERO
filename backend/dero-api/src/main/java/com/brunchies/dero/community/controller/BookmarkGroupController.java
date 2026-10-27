package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.dto.BookmarkGroupResponse;
import com.brunchies.dero.community.dto.BookmarkGroupSaveRequest;
import com.brunchies.dero.community.service.PlacementBookmarkGroupService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 북마크 그룹 CRUD({@code api-spec.md} §7, REQ-COM-08). 전부 🔒이고 <b>소유자만</b> 읽고 쓴다.
 *
 * <p>경로가 배치 하위가 아니라 톱레벨인 이유는 그룹이 배치에 종속되지 않기 때문이다 — 빈 그룹이
 * 정상 상태이고, 한 그룹에 여러 배치가 담긴다.
 *
 * <p>목록은 커서 페이지가 아니다 — 사용자가 손으로 만드는 폴더라 개수가 화면에 다 들어온다.
 */
@RestController
@RequestMapping("/api/v1/bookmark-groups")
@RequiredArgsConstructor
public class BookmarkGroupController {

	private final PlacementBookmarkGroupService placementBookmarkGroupService;

	@GetMapping
	public ResponseEntity<List<BookmarkGroupResponse>> list(Authentication authentication) {
		return ResponseEntity.ok(
				placementBookmarkGroupService.list(AuthenticatedUserId.orNull(authentication)));
	}

	/** 생성 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<BookmarkGroupResponse> create(
			Authentication authentication, @Valid @RequestBody BookmarkGroupSaveRequest request) {
		BookmarkGroupResponse response = placementBookmarkGroupService.create(
				AuthenticatedUserId.orNull(authentication), request);
		return ResponseEntity
				.created(URI.create("/api/v1/bookmark-groups/" + response.id()))
				.body(response);
	}

	/** 수정 → 200. 편집 대상이 제목·설명 둘뿐이라 통째로 받는다({@code BookmarkGroupSaveRequest}). */
	@PatchMapping("/{groupId}")
	public ResponseEntity<BookmarkGroupResponse> update(
			Authentication authentication,
			@PathVariable Long groupId,
			@Valid @RequestBody BookmarkGroupSaveRequest request) {
		return ResponseEntity.ok(placementBookmarkGroupService.update(
				AuthenticatedUserId.orNull(authentication), groupId, request));
	}

	/** 삭제 → 204. <b>담겨 있던 북마크는 살아남아 그룹 미지정이 된다.</b> */
	@DeleteMapping("/{groupId}")
	public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long groupId) {
		placementBookmarkGroupService.delete(AuthenticatedUserId.orNull(authentication), groupId);
		return ResponseEntity.noContent().build();
	}
}
