package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/**
 * {@code POST /admin/desk-textures} 요청.
 *
 * <p><b>맵 key 3종을 받지 않는다</b> — presign 발급
 * ({@code POST /admin/desk-textures/{id}/map-upload-urls})에 재질 id가 필요해 등록 시점엔 존재할 수
 * 없다. 업로드 후 {@code PATCH}로 등록한다(api-spec §9). 맵 없는 단색(도장) 재질은 셋이 NULL인 채로
 * 끝나는 것이 정상이고, 그때 렌더는 {@code baseColor} + 스칼라 2종만 쓴다(erd.md).
 *
 * <p>{@code roughness}·{@code metalness}는 {@code NUMERIC(3,2)}라 {@link BigDecimal}이다
 * ({@code double}은 반올림이 조용히 어긋난다). 값 범위 0.00~1.00은 DB가 안 막으므로 여기서 막는다.
 */
public record DeskTextureCreateRequest(
		@NotBlank @Size(max = 50) String name,
		@NotBlank @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "#RRGGBB 표기여야 합니다.")
		String baseColor,
		@NotNull @DecimalMin("0.00") @DecimalMax("1.00") @Digits(integer = 1, fraction = 2)
		BigDecimal roughness,
		@NotNull @DecimalMin("0.00") @DecimalMax("1.00") @Digits(integer = 1, fraction = 2)
		BigDecimal metalness,
		@Positive Integer tileSizeMm,
		@PositiveOrZero Integer displayOrder) {
}
