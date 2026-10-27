package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code POST /admin/hashtags} 요청. */
public record HashtagCreateRequest(
		@NotBlank @Size(max = 50) String name,
		@Size(max = 255) String description) {
}
