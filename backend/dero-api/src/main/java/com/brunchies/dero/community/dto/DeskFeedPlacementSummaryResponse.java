package com.brunchies.dero.community.dto;

/**
 * 상세에 싣는 첨부 배치 <b>요약 카드</b>(ADR-0033 결정 4 — 3D 뷰어 임베드 부결, 클릭 시 컬렉션
 * 상세로 이동). <b>배치가 {@code PUBLIC}이 아니면 이 요약 자체가 {@code null}이다</b>(결정 5 — FK는
 * 유지하고 화면이 카드를 숨긴다).
 *
 * <p>{@code thumbnailUrl}은 배치 3D 캡처({@code placement.thumbnail_key})의 presigned GET URL이고
 * 없으면 {@code null}이다.
 */
public record DeskFeedPlacementSummaryResponse(Long id, String title, String thumbnailUrl) {
}
