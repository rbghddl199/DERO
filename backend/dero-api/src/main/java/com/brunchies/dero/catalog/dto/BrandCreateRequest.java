package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /admin/brands} 요청.
 *
 * <p><b>{@code logoImageKey}를 받지 않는다.</b> 로고 key는 presign 발급
 * ({@code POST /admin/brands/{id}/logo/upload-url})에 브랜드 id가 필요해서 등록 시점엔 존재할 수 없다 —
 * 업로드가 끝난 뒤 {@code PATCH}로 등록한다(api-spec §9).
 */
public record BrandCreateRequest(
		@NotBlank @Size(max = 100) String name,
		String description,
		@Size(max = 2048) String brandUrl) {
}
