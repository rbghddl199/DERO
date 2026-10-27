package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.NotBlank;

/** 관리자 약관 Markdown 본문 업로드 URL 발급 요청. */
public record AdminTermsContentUploadUrlRequest(
		@NotBlank String fileName,
		@NotBlank String contentType) {
}
