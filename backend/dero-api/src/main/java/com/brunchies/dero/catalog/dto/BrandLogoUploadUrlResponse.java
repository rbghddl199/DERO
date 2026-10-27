package com.brunchies.dero.catalog.dto;

/**
 * {@code logoKey}는 업로드가 끝난 뒤 {@code PATCH /admin/brands/{id}}의 {@code logoImageKey}로 그대로
 * 되돌려 보낼 값이고, {@code uploadUrl}은 클라이언트가 바이트를 직접 PUT할 presigned URL이다.
 */
public record BrandLogoUploadUrlResponse(String logoKey, String uploadUrl) {
}
