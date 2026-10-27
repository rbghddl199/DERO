package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * presign 2단계 요청 — 업로드가 끝난 key 등록(api-spec.md §6-보). <b>key 하나뿐이다</b> —
 * 레지스트리는 소속만 기록하고 순서·대표는 본문 마크다운이 정한다(D34·ADR-0037 — ADR-0034의
 * {@code isPrimary}도, ADR-0036의 {@code displayOrder}도 없다).
 */
public record DeskFeedImageRegisterRequest(@NotBlank String imageKey) {
}
