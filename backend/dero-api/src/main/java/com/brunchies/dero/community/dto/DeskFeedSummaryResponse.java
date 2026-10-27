package com.brunchies.dero.community.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 데스크피드 목록 카드 한 장(매스너리 갤러리).
 *
 * <p>{@code content}를 통째로 싣는다 — 카드가 발췌를 그리는데 어디서 자를지는 화면 폭이 정하는
 * 문제라 서버가 미리 자르면 그 규칙이 두 곳에 생긴다({@link PostSummaryResponse}와 같은 판단).
 *
 * <p>{@code coverUrl}은 <b>본문 첫 인라인 이미지</b>의 presigned GET URL이다(D34·ADR-0037 — 대표
 * 컬럼도 대표 선택 UI도 없다. 대표를 바꾸려면 본문에서 이미지 순서를 바꾼다). 사진이 아직
 * 등록되지 않은 글(작성 직후 presign 진행 중)이면 {@code null}이다.
 *
 * <p>{@code imageCount}는 <b>레지스트리 행 수</b>다 — 카드 우상단 사진 수 뱃지와 라이트박스가
 * 쓴다(ADR-0037 결정 5).
 *
 * <p>{@code placementId}는 첨부 배치의 원시 FK다 — 카드가 "배치 연결됨" 뱃지를 그릴 수 있게 싣고,
 * 배치 요약 카드 자체는 상세({@link DeskFeedDetailResponse#placement()})만 싣는다.
 *
 * <p>작성자는 탈퇴({@code ON DELETE SET NULL})로 없을 수 있다 — {@code CommentResponse}와 같은
 * 폴백 문구를 서버가 답한다.
 *
 * <p>{@code mentions}가 목록에도 실리는 것은 카드가 {@code content}로 발췌를 그리기 때문이다 —
 * 없으면 발췌에 {@code [[user:12]]}가 날것으로 노출된다(D35·ADR-0038).
 */
public record DeskFeedSummaryResponse(Long id, String title, String content,
		List<DeskFeedMentionResponse> mentions, String coverUrl,
		int imageCount, int likeCount, long commentCount, List<String> hashtags, Long placementId,
		Long authorId, String nickname, String profileImageKey, OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
