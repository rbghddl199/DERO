package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * presign 2단계 요청 — 업로드가 끝난 key 등록.
 *
 * <p>{@code isPrimary}가 {@code true}면 이 글의 다른 사진에서 대표를 먼저 내린다 — 부분 유니크
 * {@code uq_post_image_post_id}({@code WHERE is_primary})가 두 번째 {@code true}를 거부하기
 * 때문이다(ADR-0013 결정 5).
 */
public record PostImageRegisterRequest(@NotBlank String imageKey, boolean isPrimary) {
}
