package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.NotBlank;

/** 프로필 이미지 2단계 presign의 2단계 요청 — 업로드가 끝난 key 등록. 재등록은 덮어쓴다. */
public record ProfileImageRegisterRequest(@NotBlank String imageKey) {
}
