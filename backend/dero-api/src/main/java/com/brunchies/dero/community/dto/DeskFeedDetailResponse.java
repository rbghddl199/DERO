package com.brunchies.dero.community.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 데스크피드 상세.
 *
 * <p><b>{@code placementId}와 {@code placement}가 따로다.</b> {@code placementId}는 FK 원시값이라
 * 첨부가 있는 한 항상 실린다 — 수정 화면이 "첨부돼 있음"을 알아야 해제 UI를 그린다.
 * {@code placement}(요약 카드)는 <b>배치가 {@code PUBLIC}일 때만</b> 실리고 공개취소되면
 * {@code null}이다(ADR-0033 결정 5 — FK는 유지, 화면이 카드를 숨긴다). 배치가 물리 삭제되면 DB
 * {@code SET NULL}이 FK를 비워 둘 다 {@code null}이 된다.
 *
 * <p>{@code images}는 <b>소속 레지스트리를 등록 순서로 실은 것이지 표시 순서가 아니다</b>
 * (D34·ADR-0037) — 화면이 그리는 순서는 {@code content} 마크다운 안 {@code ![alt](key)} 위치가
 * 정한다. 이 배열은 수정 화면이 "이 글이 가진 사진"과 삭제용 id를 알기 위한 것이다.
 *
 * <p>{@code usedProducts}는 "이 책상에 쓰인 제품" 카드 목록이다(ADR-0034 결정 5) —
 * <b>소프트 삭제된 제품은 빠진다</b>(정션 행은 남기고 화면만 숨긴다). 목록 카드에는 싣지 않는다.
 *
 * <p>{@code mentions}는 본문 안 {@code [[user:ID]]} 토큰의 해석표다(D35·ADR-0038) — 프론트는 조회
 * 없이 치환만 한다. <b>탈퇴·부재 사용자는 목록에 없다</b>({@link DeskFeedMentionResponse}).
 */
public record DeskFeedDetailResponse(Long id, String title, String content,
		List<DeskFeedMentionResponse> mentions, List<String> hashtags,
		List<DeskFeedImageResponse> images, int likeCount, long commentCount, Long placementId,
		DeskFeedPlacementSummaryResponse placement,
		List<DeskFeedProductSummaryResponse> usedProducts, Long authorId, String nickname,
		String profileImageKey, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
}
