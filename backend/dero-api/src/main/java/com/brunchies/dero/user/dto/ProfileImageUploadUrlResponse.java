package com.brunchies.dero.user.dto;

/**
 * 프로필 이미지 2단계 presign의 1단계 응답. 저장하는 게 없어 201이 아니라 200이다
 * ({@code docs/context/api-spec.md} §1 규칙 1).
 *
 * <p>{@code imageKey}는 브라우저가 {@code uploadUrl}에 바이트를 PUT한 뒤 2단계
 * ({@code PUT /users/me/profile-image})에 그대로 되돌려 줄 값이다.
 */
public record ProfileImageUploadUrlResponse(String imageKey, String uploadUrl) {
}
