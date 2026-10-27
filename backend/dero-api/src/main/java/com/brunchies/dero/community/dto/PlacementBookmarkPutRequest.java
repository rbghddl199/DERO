package com.brunchies.dero.community.dto;

/**
 * 북마크 담기 요청 — 담을 그룹을 고른다.
 *
 * <p><b>본문 없음과 {@code {"groupId": null}}은 다른 뜻이다</b>(2026-08-02 개정, DERO-343).
 * 컨트롤러가 {@code @RequestBody(required = false)}로 받는데, 본문이 아예 없으면 "담기만 하고 그룹은
 * 건드리지 않는다"이고 본문의 {@code groupId}가 {@code null}이면 "그룹 해제"다. 갈라 둔 이유는 그룹
 * 선택 UI가 없는 갤러리 카드 때문이다 — 카드가 쏘는 빈 {@code PUT}이 이동으로 해석되면 이미 그룹에
 * 담아 둔 북마크가 사용자가 시킨 적 없이 풀린다.
 *
 * <p>이미 북마크한 배치에 다른 {@code groupId}로 다시 {@code PUT}하면 <b>그룹만 바뀐다</b> —
 * 유니크가 {@code (user_id, placement_id)}라 새 행을 만들면 제약에 막힌다.
 */
public record PlacementBookmarkPutRequest(Long groupId) {
}
