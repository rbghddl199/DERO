package com.brunchies.dero.community.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 게시글 상세.
 *
 * <p><b>참조 배치 목록을 싣지 않는다</b>(ADR-0013 결정 1·2) — 참조는 {@link #content} 안의
 * {@code [[placement:ID]]} 토큰이 전부이고, 프론트가 그 토큰에서 id를 모아
 * {@code GET /placements?ids=…} <b>한 번</b>으로 카드를 채운다. 여기 배치 상세를 끼워 넣으면
 * 정본이 둘이 되고, 사라진 배치를 "삭제된 배치입니다" 플레이스홀더로 그리는 책임도 갈린다.
 */
public record PostDetailResponse(Long id, String title, String content, List<String> hashtags,
		List<PostImageResponse> images, int likeCount, long commentCount, Long authorId,
		String nickname, String profileImageKey, OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
