package com.brunchies.dero.community.service;

import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.PlacementBookmark;
import com.brunchies.dero.community.PlacementBookmarkGroup;
import com.brunchies.dero.community.dto.BookmarkStateResponse;
import com.brunchies.dero.community.dto.PlacementBookmarkPutRequest;
import com.brunchies.dero.community.repository.PlacementBookmarkGroupRepository;
import com.brunchies.dero.community.repository.PlacementBookmarkRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 북마크(REQ-COM-05·08, {@code api-spec.md} §4).
 *
 * <p><b>유니크가 {@code (user_id, placement_id)}라 배치당 1건이다.</b> 이미 북마크한 배치에 다른
 * 그룹으로 {@code PUT}하면 새 행이 아니라 기존 행의 {@code moveTo}다 — 새로 만들면 유니크에 막힌다.
 *
 * <p><b>게시글 북마크는 없다</b>(ADR-0013 결정 6).
 *
 * <p><b>목록은 여기 없다</b> — 342가 임시로 팠던 {@code GET /bookmarks}는 2026-08-02에 지웠고
 * {@code GET /placements?bookmarked=me}가 그 자리다(api-spec.md §1 규칙 3).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PlacementBookmarkService {

	private final PlacementBookmarkRepository bookmarks;
	private final PlacementBookmarkGroupRepository groups;
	private final PlacementRepository placements;
	private final UserRepository users;

	/** 현재 상태. 도입 근거는 {@code BookmarkStateResponse} Javadoc. */
	public BookmarkStateResponse get(Long userId, Long placementId) {
		visible(placementId, userId);
		return bookmarks.findByUser_IdAndPlacement_Id(userId, placementId)
				.map(bookmark -> new BookmarkStateResponse(true, groupIdOf(bookmark)))
				.orElseGet(() -> new BookmarkStateResponse(false, null));
	}

	/**
	 * 담기 → 204. <b>본문이 없으면 그룹을 건드리지 않는다</b>(2026-08-02 개정, DERO-343).
	 *
	 * <p>종전에는 본문 없는 {@code PUT}이 그룹 미지정으로 <b>이동</b>이었다. 그룹 선택 UI가 없는
	 * 갤러리 카드가 그 요청을 쏘면 이미 그룹에 담아 둔 북마크가 조용히 풀린다 — 사용자가 시킨 적
	 * 없는 변경이다. 지금 규약은 셋이다: 본문 없음 = 담기만(그룹 유지) · {@code {"groupId": 3}} =
	 * 그 그룹으로 이동 · {@code {"groupId": null}} = 명시적 그룹 해제.
	 */
	@Transactional
	public void bookmark(Long userId, Long placementId, PlacementBookmarkPutRequest request) {
		Placement placement = visible(placementId, userId);
		PlacementBookmarkGroup group =
				resolveGroup(userId, request == null ? null : request.groupId());

		Optional<PlacementBookmark> existing =
				bookmarks.findByUser_IdAndPlacement_Id(userId, placementId);
		if (existing.isPresent()) {
			if (request != null) {
				existing.get().moveTo(group);
			}
			return;
		}
		try {
			bookmarks.saveAndFlush(
					PlacementBookmark.create(users.getReferenceById(userId), placement, group));
		} catch (DataIntegrityViolationException e) {
			// uq_placement_bookmark_user_id_placement_id 위반 = 위 조회와 이 INSERT 사이에 같은
			// 사용자의 요청이 먼저 담았다는 뜻이다. 담긴 상태와 결과가 같아야 하므로(멱등) 정상
			// 종료한다 — 그쪽이 지정한 그룹이 남는다.
			return;
		}
	}

	@Transactional
	public void unbookmark(Long userId, Long placementId) {
		visible(placementId, userId);
		bookmarks.deleteByUser_IdAndPlacement_Id(userId, placementId);
	}

	/** {@code null}은 그룹 미지정이다(정상 상태). 남의 그룹·없는 그룹은 404다. */
	private PlacementBookmarkGroup resolveGroup(Long userId, Long groupId) {
		if (groupId == null) {
			return null;
		}
		return groups.findOwned(groupId, userId)
				.orElseThrow(
						() -> new BusinessException(CommunityErrorCode.BOOKMARK_GROUP_NOT_FOUND));
	}

	/** 소프트 삭제된 그룹은 없는 것으로 본다(배치 목록의 {@code bookmarkGroupId}와 같은 규칙). */
	private Long groupIdOf(PlacementBookmark bookmark) {
		PlacementBookmarkGroup group = bookmark.getPlacementBookmarkGroup();
		return group == null || group.isDeleted() ? null : group.getId();
	}

	private Placement visible(Long placementId, Long userId) {
		return placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
	}
}
