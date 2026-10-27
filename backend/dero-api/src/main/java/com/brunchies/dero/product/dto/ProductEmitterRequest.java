package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Distribution;
import com.brunchies.dero.product.EmitterShape;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/**
 * {@code PUT /admin/products/{id}/emitter} 요청 — upsert다(제품당 발광체 1개).
 *
 * <p>erd.md {@code product_emitter} 절 검증 표 중 <b>단일 필드</b> 세 줄이 여기 애노테이션으로
 * 있다: {@code defaultColor}의 {@code '#RRGGBB'} 표기 · {@code lumens}·{@code radiusMm} 양수.
 * 필드끼리 서로를 보는 두 줄({@code shape}↔{@code distribution}, {@code point_*_mm} 셋 묶음)은
 * {@code ProductEmitter}가 지키고 위반은 422다.
 *
 * <p><b>원시타입이 아니라 박싱 타입이다</b> — {@code int}·{@code boolean}이면 필드를 빠뜨렸을 때
 * Jackson이 조용히 0·false를 넣어 {@code @NotNull}이 아무것도 못 잡는다. 특히
 * {@code recolorable}은 {@code false} 기본값이 "색 고정"으로 둔갑해 리컬러 가능한 제품에서 색 선택
 * UI가 아예 안 뜬다(erd.md가 DB 기본값을 금지한 것과 같은 사유).
 */
public record ProductEmitterRequest(
		@NotNull EmitterShape shape,
		Distribution distribution,
		@NotNull @Positive Integer lumens,
		@NotNull @Positive Integer radiusMm,
		@NotNull Boolean recolorable,
		@NotNull @Pattern(regexp = "^#[0-9A-Fa-f]{6}$") String defaultColor,
		Integer pointXMm,
		Integer pointYMm,
		Integer pointZMm) {
}
