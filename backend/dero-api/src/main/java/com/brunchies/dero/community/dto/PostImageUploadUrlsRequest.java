package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * presign 1단계 요청 — 올릴 파일들의 MIME 타입. 개수가 곧 발급할 URL 수다.
 *
 * <p>타입을 받는 이유는 둘이다: presigned PUT의 {@code Content-Type}이 서명에 들어가고, key의
 * 확장자를 그것으로 정한다. {@code @Size(max = 20)}은 1차 방어일 뿐이고 <b>진짜 상한은 서비스가
 * "이미 있는 장수 + 요청 수"로 판단한다</b> — 20장을 열 번 나눠 올리는 경로가 있다.
 */
public record PostImageUploadUrlsRequest(
		@NotEmpty @Size(max = 20) List<@NotBlank String> contentTypes) {
}
