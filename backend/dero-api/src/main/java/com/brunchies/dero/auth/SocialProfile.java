package com.brunchies.dero.auth;

import com.brunchies.dero.user.Provider;

/**
 * 소셜 제공자에게서 받은 프로필을 정규화한 값(ADR-0005 결정 7) — 카카오·구글 응답 구조 차이를
 * {@link SocialProfileExtractor}가 여기로 흡수한다. {@code email}은 항상 채워진다 — 카카오가 이메일
 * 동의를 안 주면 {@link SocialProfileExtractor}가 합성 이메일을 넣는다.
 */
public record SocialProfile(Provider provider, String providerId, String email, String nickname) {
}
