package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 북마크 그룹 생성·수정 요청. 편집 가능한 필드가 {@code title}·{@code description} 둘뿐이라
 * {@code POST}와 {@code PATCH}가 같은 모양을 쓴다 — 둘로 쪼개면 같은 제약을 두 곳에 적게 된다.
 *
 * <p><b>{@code PATCH}지만 두 필드를 통째로 바꾼다.</b> 엔티티의 갱신 통로가
 * {@code PlacementBookmarkGroup.update(title, description)} 하나이고, 필드가 둘뿐이라 부분 갱신을
 * 위해 "안 보낸 필드"와 "null로 지운 필드"를 가르는 장치를 도입할 값어치가 없다.
 *
 * <p>길이 제약은 {@code placement_bookmark_group}의 컬럼 정의와 같다 — 어긋나면 DB가 잘라내거나
 * 저장 시점에 터진다.
 */
public record BookmarkGroupSaveRequest(
		@NotBlank @Size(max = 50) String title,
		@Size(max = 255) String description) {
}
