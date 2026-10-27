package com.brunchies.dero.community.service;

import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.PlacementBookmark;
import com.brunchies.dero.community.PlacementBookmarkGroup;
import com.brunchies.dero.community.dto.BookmarkGroupCountRow;
import com.brunchies.dero.community.dto.BookmarkGroupResponse;
import com.brunchies.dero.community.dto.BookmarkGroupSaveRequest;
import com.brunchies.dero.community.repository.PlacementBookmarkGroupRepository;
import com.brunchies.dero.community.repository.PlacementBookmarkRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 북마크 그룹(REQ-COM-08, {@code api-spec.md} §7).
 *
 * <p><b>소유자만 읽고 쓴다.</b> 남의 그룹은 조회 쿼리에서 이미 빈 결과라 404가 된다(403이 아니다 —
 * 그런 그룹이 있다는 사실 자체를 흘리지 않는다).
 *
 * <p><b>그룹 삭제는 soft delete이고 북마크는 살아남는다.</b> DDL의 {@code ON DELETE SET NULL}은
 * 물리 삭제 때만 도는데 여기는 soft delete라 돌지 않는다 — 그래서 지우기 전에 이 그룹을 가리키는
 * 내 북마크들을 명시적으로 미지정으로 옮긴다. 안 하면 죽은 그룹을 가리키는 북마크가 남는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PlacementBookmarkGroupService {

	private final PlacementBookmarkGroupRepository groups;
	private final PlacementBookmarkRepository bookmarks;
	private final UserRepository users;

	/**
	 * 내 그룹 목록. <b>개수는 group by 한 번으로 뽑는다</b> — 그룹마다 count를 날리면 N+1이다.
	 */
	public List<BookmarkGroupResponse> list(Long userId) {
		List<PlacementBookmarkGroup> mine = groups.findByUser_IdAndDeletedAtIsNullOrderByIdAsc(userId);
		if (mine.isEmpty()) {
			return List.of();
		}
		Map<Long, Long> countByGroupId =
				countByGroupId(mine.stream().map(PlacementBookmarkGroup::getId).toList());
		return mine.stream()
				.map(group -> response(group, countByGroupId.getOrDefault(group.getId(), 0L)))
				.toList();
	}

	/** 새 그룹은 담긴 북마크가 없으므로 개수는 셀 것도 없이 0이다. */
	@Transactional
	public BookmarkGroupResponse create(Long userId, BookmarkGroupSaveRequest request) {
		PlacementBookmarkGroup group = groups.save(PlacementBookmarkGroup.create(
				users.getReferenceById(userId), request.title(), request.description()));
		return response(group, 0);
	}

	@Transactional
	public BookmarkGroupResponse update(
			Long userId, Long groupId, BookmarkGroupSaveRequest request) {
		PlacementBookmarkGroup group = owned(userId, groupId);
		group.update(request.title(), request.description());
		return response(group, countByGroupId(List.of(groupId)).getOrDefault(groupId, 0L));
	}

	@Transactional
	public void delete(Long userId, Long groupId) {
		PlacementBookmarkGroup group = owned(userId, groupId);
		bookmarks.findByUser_IdAndPlacementBookmarkGroup_Id(userId, groupId)
				.forEach(bookmark -> bookmark.moveTo(null));
		group.softDelete();
	}

	private Map<Long, Long> countByGroupId(List<Long> groupIds) {
		return bookmarks.countByGroupIdIn(groupIds).stream()
				.collect(Collectors.toMap(
						BookmarkGroupCountRow::groupId, BookmarkGroupCountRow::bookmarkCount));
	}

	private BookmarkGroupResponse response(PlacementBookmarkGroup group, long bookmarkCount) {
		return new BookmarkGroupResponse(group.getId(), group.getTitle(), group.getDescription(),
				bookmarkCount, group.getCreatedAt());
	}

	private PlacementBookmarkGroup owned(Long userId, Long groupId) {
		return groups.findOwned(groupId, userId)
				.orElseThrow(
						() -> new BusinessException(CommunityErrorCode.BOOKMARK_GROUP_NOT_FOUND));
	}
}
