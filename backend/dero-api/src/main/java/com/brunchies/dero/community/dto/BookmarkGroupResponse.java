package com.brunchies.dero.community.dto;

import java.time.OffsetDateTime;

/**
 * 북마크 그룹 한 줄.
 *
 * <p><b>{@code from()} 정적 팩터리를 두지 않는다</b>(규칙 11) — {@code bookmarkCount}가 그룹
 * 엔티티에 없는 별도 집계라 출처가 둘이다. 조립은 서비스가 한다.
 *
 * <p>{@code bookmarkCount}는 <b>배치가 살아있는</b> 북마크만 센다 — 소프트 삭제된 배치는 목록에도
 * 안 나오므로 개수에 넣으면 화면과 숫자가 어긋난다.
 */
public record BookmarkGroupResponse(Long id, String title, String description, long bookmarkCount,
		OffsetDateTime createdAt) {
}
