package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.Positive;

/** {@code PATCH /admin/vesa-specs/{id}} 요청. NULL은 "안 바꾼다"다. */
public record VesaSpecPatchRequest(
		@Positive Integer widthMm,
		@Positive Integer heightMm) {
}
