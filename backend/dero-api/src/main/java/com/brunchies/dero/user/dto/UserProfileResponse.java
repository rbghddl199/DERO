package com.brunchies.dero.user.dto;

/**
 * {@code GET /api/v1/users/{id}} 응답 — 남의 프로필(REQ-COM-07, api-spec.md §3).
 *
 * <p><b>{@code email}·{@code provider}·{@code role}이 없다</b>. {@link UserMeResponse}와 필드가
 * 겹친다고 합치지 마라 — 이 응답은 🔓라 비로그인에게도 나가고, 합치는 순간 남의 이메일과 소셜
 * 제공자가 공개된다.
 *
 * <p>{@code following}은 <b>조회자 기준</b>이다("내가 이 사람을 팔로우 중인가"). 비로그인이면 항상
 * {@code false}다. 프론트가 재접속 후에도 팔로우 상태를 맞게 그리는 유일한 근거라 별도 상태 조회
 * 엔드포인트를 만들지 않는다.
 */
public record UserProfileResponse(
		Long id, String nickname, String profileImageUrl,
		long followerCount, long followingCount, boolean following) {
}
