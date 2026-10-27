package com.brunchies.dero.product.dto;

/**
 * {@code imageKey}는 업로드 완료 후 {@code POST /products/{id}/images}로 그대로 되돌려 보낼 값이고
 * ({@code product_image.image_key}에 저장된다), {@code uploadUrl}은 클라이언트가 파일 바이트를 S3에
 * 직접 PUT할 presigned URL이다.
 */
public record ProductImageUploadUrlResponse(String imageKey, String uploadUrl) {
}
