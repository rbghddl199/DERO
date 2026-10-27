package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * {@code POST /admin/vesa-specs} 요청.
 *
 * <p>엔티티 필드는 {@code int}지만 여기는 {@link Integer}다 — 원시 타입이면 값을 안 보냈을 때 조용히
 * 0이 되어 {@code @Positive}가 "0은 양수가 아니다"라는 엉뚱한 메시지를 내고 {@code @NotNull}이
 * 무의미해진다.
 */
public record VesaSpecCreateRequest(
		@NotNull @Positive Integer widthMm,
		@NotNull @Positive Integer heightMm) {
}
