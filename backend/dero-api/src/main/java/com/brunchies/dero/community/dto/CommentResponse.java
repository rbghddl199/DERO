package com.brunchies.dero.community.dto;

import com.brunchies.dero.community.Comment;
import com.brunchies.dero.user.User;
import java.time.OffsetDateTime;

/**
 * 댓글 한 줄.
 *
 * <p><b>작성자가 없을 수 있다</b> — {@code comment.user_id}가 {@code ON DELETE SET NULL}이라 탈퇴해도
 * 댓글은 남고 작성자만 비워진다(대화 맥락이 통째로 사라지지 않게). 그 경우 {@code userId}·
 * {@code profileImageKey}는 {@code null}이고 {@code nickname}은 고정 문구다 — 프론트가 매번 같은
 * 폴백 문구를 정하지 않게 서버가 답한다.
 *
 * <p>{@code profileImageKey}는 object key 원문이다({@code User.profileImageKey}의 계약) — 완성
 * URL은 발급 시점에 조립되고 여기 담지 않는다.
 */
public record CommentResponse(Long id, Long userId, String nickname, String profileImageKey,
		String content, OffsetDateTime createdAt) {

	private static final String WITHDRAWN_NICKNAME = "알 수 없음";

	public static CommentResponse from(Comment comment) {
		User user = comment.getUser();
		return new CommentResponse(
				comment.getId(),
				user == null ? null : user.getId(),
				user == null ? WITHDRAWN_NICKNAME : user.getNickname(),
				user == null ? null : user.getProfileImageKey(),
				comment.getContent(),
				comment.getCreatedAt());
	}
}
