package com.brunchies.dero.product.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /admin/products/{id}/asset/upload-url} 요청.
 *
 * <p><b>{@code fileName}을 받지 않는다</b>({@link ProductImageUploadUrlRequest}와 다른 점) —
 * 에셋 확장자는 {@code .glb} 하나뿐이라 서버가 key를 통째로 짓는다. 이미지는 png·jpg·webp가 섞여
 * 원본 확장자를 따라가야 했다.
 */
public record AssetUploadUrlRequest(@NotBlank String contentType) {
}
