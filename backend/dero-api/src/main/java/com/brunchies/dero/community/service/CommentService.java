package com.brunchies.dero.community.service;

import com.brunchies.dero.community.Comment;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.community.dto.CommentResponse;
import com.brunchies.dero.community.repository.CommentRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 댓글(REQ-COM-06, {@code api-spec.md} §4).
 *
 * <p><b>조회는 비로그인도 된다</b>(🔓). 그때 {@code userId}가 {@code null}로 들어와 가시성 쿼리가
 * {@code PUBLIC}만 통과시킨다 — 비로그인이 남의 비공개 배치 댓글을 읽을 길은 없다.
 *
 * <p><b>삭제는 작성자 본인만이고 403이다</b>(404가 아니다) — 남의 댓글은 이미 목록에 본문까지 실려
 * 보이므로 존재를 숨길 것이 없다. 반대로 배치·그룹의 "남의 것"은 404다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class CommentService {

	/** 첫 페이지의 커서 자리값. 최신순(id 내림차순)이라 어떤 id보다 커야 "커서 없음"과 같은 뜻이 된다. */
	private static final long NO_CURSOR = Long.MAX_VALUE;

	private final CommentRepository comments;
	private final PlacementRepository placements;
	private final UserRepository users;

	/** 최신순(id 내림차순) 커서 페이지 — "더 보기"가 더 오래된 댓글을 이어 받는다. */
	public CursorPage<CommentResponse> list(Long userId, Long placementId, String cursor, int size) {
		visible(placementId, userId);
		Long cursorId = CursorCodec.decode(cursor);

		List<Comment> rows = comments.findPageByPlacementId(
				placementId, cursorId == null ? NO_CURSOR : cursorId, Limit.of(size + 1));
		boolean hasNext = rows.size() > size;
		List<Comment> content = hasNext ? rows.subList(0, size) : rows;

		// 이후 페이지는 첫 페이지가 이미 돌려준 값을 프론트가 들고 있다 — 매 페이지 재계산하지 않는다.
		long totalCount =
				cursorId == null ? comments.countByPlacement_IdAndDeletedAtIsNull(placementId) : 0;
		String nextCursor =
				hasNext ? CursorCodec.encode(content.get(content.size() - 1).getId()) : null;

		return new CursorPage<>(
				content.stream().map(CommentResponse::from).toList(), nextCursor, hasNext, totalCount);
	}

	@Transactional
	public CommentResponse create(Long userId, Long placementId, CommentCreateRequest request) {
		Placement placement = visible(placementId, userId);
		User author = users.getReferenceById(userId);
		Comment comment = comments.save(Comment.create(placement, author, request.content()));
		return CommentResponse.from(comment);
	}

	@Transactional
	public void delete(Long userId, Long placementId, Long commentId) {
		visible(placementId, userId);
		Comment comment = comments.findOwnedByPlacement(commentId, placementId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.COMMENT_NOT_FOUND));
		// 작성자가 탈퇴하면 user가 NULL이 된다 — NULL 비교에 맡기면 아무나 주인이 되므로 먼저 막는다.
		if (comment.getUser() == null || !comment.getUser().getId().equals(userId)) {
			throw new BusinessException(CommunityErrorCode.COMMENT_NOT_OWNED);
		}
		comment.softDelete();
	}

	private Placement visible(Long placementId, Long userId) {
		return placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
	}
}
