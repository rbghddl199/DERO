package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /api/v1/users/me/profile-image/upload-url} 요청.
 *
 * <p><b>파일명을 받지 않는다</b>({@code ProductImageUploadUrlRequest}와 다른 점). key가
 * {@code profile-images/{userId}.{확장자}}로 결정론적이어야 재업로드가 같은 자리를 덮어쓰는데
 * (api-spec.md §3 "항상 덮어씀"), 파일명에서 확장자를 뽑으면 사용자 입력이 key에 섞여 그 결정성이
 * 깨진다 — 확장자는 {@code contentType} 허용 목록에서 서버가 정한다.
 */
public record ProfileImageUploadUrlRequest(@NotBlank String contentType) {
}
