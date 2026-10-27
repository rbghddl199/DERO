package com.brunchies.dero.community.dto;

/**
 * 북마크 토글의 현재 상태. 도입 근거는 {@link LikeStateResponse}와 같다 — 같은 단수 하위 리소스의
 * 읽기라 {@code GET}을 얹었고, 배치 상세가 이 값을 싣게 되는 날 지운다.
 *
 * <p>{@code groupId}는 담긴 그룹이다. <b>북마크했는데 {@code groupId}가 {@code null}인 것이 정상
 * 상태</b>다(그룹 미지정) — {@code bookmarked}로 판정하고 {@code groupId}의 유무로 판정하지 마라.
 */
public record BookmarkStateResponse(boolean bookmarked, Long groupId) {
}
