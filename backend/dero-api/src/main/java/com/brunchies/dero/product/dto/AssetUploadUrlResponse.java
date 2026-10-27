package com.brunchies.dero.product.dto;

/**
 * {@code assetKey}는 업로드 완료 후 {@code PUT /admin/products/{id}/asset}으로 그대로 되돌려 보낼
 * 값이고({@code asset.asset_key}에 저장된다), {@code uploadUrl}은 클라이언트가 GLB 바이트를 직접
 * PUT할 presigned URL이다.
 */
public record AssetUploadUrlResponse(String assetKey, String uploadUrl) {
}
