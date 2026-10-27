package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/**
 * {@code PATCH /admin/desk-textures/{id}} 요청. NULL은 "안 바꾼다"다.
 *
 * <p><b>맵 key 3종의 등록 경로가 여기다</b> — presign으로 받은 key를 업로드가 끝난 뒤 여기로 보낸다
 * (api-spec §9: "key 등록은 PATCH 본문 — 별도 등록 엔드포인트 없음"). NULL이 "안 바꾼다"라
 * 맵을 다시 떼어내 단색 재질로 되돌리는 것은 이 경로로 할 수 없다.
 */
public record DeskTexturePatchRequest(
		@Size(max = 50) String name,
		@Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "#RRGGBB 표기여야 합니다.") String baseColor,
		@Size(max = 1024) String albedoKey,
		@Size(max = 1024) String roughnessKey,
		@Size(max = 1024) String normalKey,
		@DecimalMin("0.00") @DecimalMax("1.00") @Digits(integer = 1, fraction = 2) BigDecimal roughness,
		@DecimalMin("0.00") @DecimalMax("1.00") @Digits(integer = 1, fraction = 2) BigDecimal metalness,
		@Positive Integer tileSizeMm,
		@PositiveOrZero Integer displayOrder) {
}
