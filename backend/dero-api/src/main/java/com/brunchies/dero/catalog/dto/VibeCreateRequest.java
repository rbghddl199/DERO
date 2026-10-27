package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code POST /admin/vibes} 요청. */
public record VibeCreateRequest(
		@NotBlank @Size(max = 50) String name) {
}
