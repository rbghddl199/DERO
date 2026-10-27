package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.Size;

/** {@code PATCH /admin/vibes/{id}} 요청. NULL은 "안 바꾼다"다. */
public record VibePatchRequest(
		@Size(max = 50) String name) {
}
