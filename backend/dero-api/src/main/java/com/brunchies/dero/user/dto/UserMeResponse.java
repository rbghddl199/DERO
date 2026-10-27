package com.brunchies.dero.user.dto;

import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import java.time.OffsetDateTime;

/**
 * {@code GET /api/v1/users/me} 응답(REQ-USR-01).
 *
 * <p>{@code onboardingRequired}는 <b>파생값</b>이다 — 필수 약관 각 항목의 현행 회차 동의 행이
 * {@code user_consent}에 다 있으면 {@code false}다. {@code user.onboarded} 같은 플래그 컬럼을
 * 만들지 않는다: 약관이 개정되면 그 플래그가 조용히 거짓말한다(`docs/context/api-spec.md` §3).
 * 프론트는 이 값 하나만 보고 온보딩 화면으로 보낸다 — 별도 상태 조회 엔드포인트가 없다.
 *
 * <p>{@code createdAt}은 새 컬럼이 아니라 {@code BaseEntity}가 이미 감사용으로 채워 둔 값을
 * 노출만 한 것이다(마이페이지 "가입일" 표시, 2026-08-06). ADR-0008 결정 7대로 오프셋 포함
 * ISO-8601로 직렬화된다.
 */
public record UserMeResponse(
		Long id, String email, String nickname, String profileImageUrl, Provider provider,
		UserRole role, boolean onboardingRequired, OffsetDateTime createdAt) {

	public static UserMeResponse from(
			User user, String profileImageUrl, boolean onboardingRequired) {
		return new UserMeResponse(user.getId(), user.getEmail(), user.getNickname(),
				profileImageUrl, user.getProvider(), user.getRole(), onboardingRequired,
				user.getCreatedAt());
	}
}
