package com.brunchies.dero.placement.dto;

import jakarta.validation.constraints.NotBlank;

/** 썸네일 2단계 presign의 2단계 요청 — 업로드가 끝난 key 등록(204). 재등록은 덮어쓴다. */
public record ThumbnailRegisterRequest(@NotBlank String thumbnailKey) {
}
