package com.brunchies.dero.community.service;

import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.DeskFeed;
import com.brunchies.dero.community.DeskFeedComment;
import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.community.dto.DeskFeedCommentResponse;
import com.brunchies.dero.community.repository.DeskFeedCommentRepository;
import com.brunchies.dero.community.repository.DeskFeedRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 데스크피드 댓글(REQ-COM-16, api-spec.md §6-보) — <b>처음부터 실영속이다</b>. 종전 마커 구조의
 * 댓글은 세션 메모리라 새로고침에 증발했고(ADR-0033 결함 4) 그 처방이 이 서비스다.
 *
 * <p>구조는 {@link CommentService}(배치 댓글)와 같고 가시성 게이트만 다르다 — 데스크피드에는 게시
 * 상태가 없어 "지워지지 않았는가" 하나다(목록도 비로그인 200, 🔓). 삭제는 작성자 본인만 403이다
 * (404가 아니다 — 본문이 이미 보인다).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DeskFeedCommentService {

	/** 첫 페이지의 커서 자리값. 최신순(id 내림차순)이라 어떤 id보다 커야 "커서 없음"과 같은 뜻이 된다. */
	private static final long NO_CURSOR = Long.MAX_VALUE;

	private final DeskFeedCommentRepository deskFeedComments;
	private final DeskFeedRepository deskFeeds;
	private final UserRepository users;
	private final MentionService mentionService;

	/** 최신순(id 내림차순) 커서 페이지 — "더 보기"가 더 오래된 댓글을 이어 받는다. */
	public CursorPage<DeskFeedCommentResponse> list(Long deskFeedId, String cursor, int size) {
		existing(deskFeedId);
		Long cursorId = CursorCodec.decode(cursor);

		List<DeskFeedComment> rows = deskFeedComments.findPageByDeskFeedId(
				deskFeedId, cursorId == null ? NO_CURSOR : cursorId, Limit.of(size + 1));
		boolean hasNext = rows.size() > size;
		List<DeskFeedComment> content = hasNext ? rows.subList(0, size) : rows;

		// 이후 페이지는 첫 페이지가 이미 돌려준 값을 프론트가 들고 있다 — 매 페이지 재계산하지 않는다.
		long totalCount = cursorId == null
				? deskFeedComments.countByDeskFeed_IdAndDeletedAtIsNull(deskFeedId)
				: 0;
		String nextCursor =
				hasNext ? CursorCodec.encode(content.getLast().getId()) : null;

		// 멘션 닉네임은 한 페이지를 통째로 한 번에 푼다 — 댓글마다 풀면 페이지당 20번 조회다.
		Map<Long, String> nicknames =
				mentionService.nicknamesIn(content.stream().map(DeskFeedComment::getContent).toList());

		return new CursorPage<>(content.stream()
				.map(comment -> DeskFeedCommentResponse.from(
						comment, mentionService.mentionsOf(comment.getContent(), nicknames)))
				.toList(),
				nextCursor, hasNext, totalCount);
	}

	@Transactional
	public DeskFeedCommentResponse create(Long userId, Long deskFeedId,
			CommentCreateRequest request) {
		DeskFeed deskFeed = existing(deskFeedId);
		User author = users.getReferenceById(userId);
		DeskFeedComment comment =
				deskFeedComments.save(DeskFeedComment.create(deskFeed, author, request.content()));
		return DeskFeedCommentResponse.from(comment, mentionService.resolve(comment.getContent()));
	}

	@Transactional
	public void delete(Long userId, Long deskFeedId, Long commentId) {
		existing(deskFeedId);
		DeskFeedComment comment = deskFeedComments.findOwnedByDeskFeed(commentId, deskFeedId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.COMMENT_NOT_FOUND));
		// 작성자가 탈퇴하면 user가 NULL이 된다 — NULL 비교에 맡기면 아무나 주인이 된다.
		if (comment.getUser() == null || !comment.getUser().getId().equals(userId)) {
			throw new BusinessException(CommunityErrorCode.COMMENT_NOT_OWNED);
		}
		comment.softDelete();
	}

	private DeskFeed existing(Long deskFeedId) {
		return deskFeeds.findByIdAndDeletedAtIsNull(deskFeedId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.DESK_FEED_NOT_FOUND));
	}
}
