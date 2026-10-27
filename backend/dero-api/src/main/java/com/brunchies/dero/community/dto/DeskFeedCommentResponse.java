package com.brunchies.dero.community.dto;

import com.brunchies.dero.community.DeskFeedComment;
import com.brunchies.dero.user.User;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 데스크피드 댓글 한 줄 — 필드 계약은 {@link CommentResponse}(배치 댓글)와 같고 원천 엔티티만
 * 다르다. 작성자 탈퇴({@code ON DELETE SET NULL}) 폴백 문구도 같은 값이다 — 화면이 대상마다 다른
 * 문구를 들고 있지 않게 서버가 통일한다.
 *
 * <p>{@code mentions}는 댓글 본문 안 {@code [[user:ID]]} 토큰의 해석표다(D35·ADR-0038) — 배치
 * 댓글에는 없다(멘션은 데스크피드 전용이다). 인자가 둘인 것은 <b>토큰 해석이 DB 조회를 타서</b>
 * 엔티티 하나로는 만들 수 없기 때문이고, 해석 자체는 호출부({@code DeskFeedCommentService})가
 * {@code MentionService}로 먼저 끝낸다 — 그래야 목록이 댓글마다 조회하지 않는다.
 */
public record DeskFeedCommentResponse(Long id, Long userId, String nickname,
		String profileImageKey, String content, List<DeskFeedMentionResponse> mentions,
		OffsetDateTime createdAt) {

	private static final String WITHDRAWN_NICKNAME = "알 수 없음";

	public static DeskFeedCommentResponse from(DeskFeedComment comment,
			List<DeskFeedMentionResponse> mentions) {
		User user = comment.getUser();
		return new DeskFeedCommentResponse(
				comment.getId(),
				user == null ? null : user.getId(),
				user == null ? WITHDRAWN_NICKNAME : user.getNickname(),
				user == null ? null : user.getProfileImageKey(),
				comment.getContent(),
				mentions,
				comment.getCreatedAt());
	}
}
