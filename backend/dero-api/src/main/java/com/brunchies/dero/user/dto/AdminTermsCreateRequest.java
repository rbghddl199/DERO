package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/** 관리자 약관 새 개정 회차 발행 요청. revision은 서버가 현재 최종 회차에 1을 더해 정한다. */
public record AdminTermsCreateRequest(
		@NotBlank @Size(max = 30) String code,
		@NotBlank @Size(max = 200) String title,
		@NotBlank @Size(max = 1024) String contentKey,
		boolean required,
		@NotNull OffsetDateTime effectiveAt) {
}
