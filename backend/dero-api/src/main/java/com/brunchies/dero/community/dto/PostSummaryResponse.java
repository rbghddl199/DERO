package com.brunchies.dero.community.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 목록 카드 한 장.
 *
 * <p>{@code content}를 통째로 싣는다 — 카드가 발췌를 그리는데, 어디서 자를지는 화면 폭이 정하는
 * 문제라 서버가 미리 자르면 그 규칙이 두 곳에 생긴다. 본문 안의 {@code [[placement:ID]]} 토큰도
 * 그대로 실려 나가므로 카드는 그것을 지우고 그린다.
 *
 * <p>{@code thumbnailUrl}은 {@code is_primary} 사진 1장의 presigned GET URL이다(ADR-0013 결정 5).
 * 사진이 없거나 대표를 안 정했으면 {@code null}이고, 그때 카드는 표지 없는 카드다.
 *
 * <p>작성자는 탈퇴({@code ON DELETE SET NULL})로 없을 수 있다 — {@link CommentResponse}와 같은
 * 폴백 문구를 서버가 답한다.
 */
public record PostSummaryResponse(Long id, String title, String content, String thumbnailUrl,
		int likeCount, long commentCount, List<String> hashtags, Long authorId, String nickname,
		String profileImageKey, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
}
