package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.Size;

/**
 * {@code PATCH /admin/brands/{id}} 요청.
 *
 * <p><b>NULL은 "안 바꾼다"는 뜻이다</b>({@code AdminProductPatchRequest}와 같은 규칙). 그래서 이미
 * 등록된 값을 다시 NULL로 되돌리는 것은 이 경로로 할 수 없다 — 누락과 명시적 null을 가르려면 필드마다
 * 래퍼가 필요한데 그 요구가 아직 온 적이 없다.
 *
 * <p>{@code logoImageKey}는 presign 업로드가 끝난 뒤 여기로 등록한다.
 */
public record BrandPatchRequest(
		@Size(max = 100) String name,
		String description,
		@Size(max = 2048) String brandUrl,
		@Size(max = 1024) String logoImageKey) {
}
