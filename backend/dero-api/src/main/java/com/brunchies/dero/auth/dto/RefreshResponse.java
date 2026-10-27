package com.brunchies.dero.auth.dto;

/** {@code POST /api/v1/auth/refresh} 응답 — 액세스 토큰은 바디로, 리프레시는 쿠키로만 오간다. */
public record RefreshResponse(String accessToken, long expiresInSeconds) {
}
