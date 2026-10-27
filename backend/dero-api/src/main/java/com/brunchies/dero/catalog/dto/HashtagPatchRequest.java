package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.Size;

/** {@code PATCH /admin/hashtags/{id}} 요청. NULL은 "안 바꾼다"다. */
public record HashtagPatchRequest(
		@Size(max = 50) String name,
		@Size(max = 255) String description) {
}
