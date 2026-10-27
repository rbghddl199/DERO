package com.brunchies.dero.placement.dto;

/**
 * 썸네일 2단계 presign의 1단계 응답 — presigned PUT URL. 저장하는 게 없어 201이 아니라 200이다
 * ({@code docs/context/api-spec.md} §1 규칙 1).
 *
 * <p>{@code thumbnailKey}를 같이 내려 주는 이유: 브라우저가 그 URL에 올린 뒤 2단계
 * ({@code PUT .../thumbnail})에 이 key를 그대로 되돌려 줘야 서버가 어느 파일을 등록할지 안다.
 */
public record ThumbnailUploadUrlResponse(String thumbnailKey, String uploadUrl) {
}
