package com.brunchies.dero.community.dto;

/**
 * 그룹별 북마크 수 집계 행. <b>응답 DTO가 아니라 쿼리 결과</b>다 —
 * {@code PlacementBookmarkRepository.countByGroupIdIn}이 그룹 목록의 개수를 한 번에 채우려고 쓴다.
 *
 * <p>프로젝션을 쓰는 근거는 ADR-0018 결정 1의 예외 ①(집계)이다 — 엔티티로 읽을 대상이 없다.
 */
public record BookmarkGroupCountRow(Long groupId, long bookmarkCount) {
}
