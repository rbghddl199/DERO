package com.brunchies.dero.user.dto;

/**
 * {@code GET /api/v1/users/search?q=} 한 줄 — 멘션 자동완성 후보(D35·ADR-0038 결정 3).
 *
 * <p><b>로그인 사용자에게만 나간다</b>(SecurityConfig). 비로그인에 열면 닉네임 열거 통로가 되고,
 * 그것을 막는 것이 인증 요구의 유일한 목적이다.
 *
 * <p>필드는 <b>고르는 데 필요한 최소</b>다 — 팔로워 수·자기소개·이메일은 싣지 않는다
 * ({@link UserProfileResponse}가 이미 🔓라 겹칠 이유가 없고, 이메일 부결은 ADR-0027 결정 3).
 * {@code userId}가 그대로 본문에 박히는 {@code [[user:ID]]} 토큰의 ID다.
 */
public record UserSearchResultResponse(Long userId, String nickname, String profileImageUrl) {
}
