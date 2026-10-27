package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Distribution;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 조명 규격 입력. 등록(POST)·수정(PATCH)이 공유하고 필수 여부를 {@link OnCreate} 그룹이 가른다.
 *
 * <p><b>광학 6종은 등록에서도 선택이다</b>(2026-07-29 개정) — 카탈로그 표기 마커라 렌더가 읽지
 * 않는다. 스펙시트에 루멘을 안 적는 조명이 실재하는데 필수로 두면 등록자가 값을 <b>지어내게</b>
 * 된다. 렌더가 읽는 lm·반경·배광·색은 {@code product_emitter}가 정본이고 그쪽은 B2 소관이다.
 *
 * <p>반대로 치수 3종과 boolean 2종은 등록 필수다 — 전자는 호환성 판정 ③의 입력이라 결측이면 판정이
 * 못 돌고, 후자는 nullable boolean 금지 + 기본값 금지가 겹친 자리다.
 */
public record LightSpecRequest(
		@NotNull(groups = OnCreate.class) @Positive Integer widthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer depthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer heightMm,
		@NotNull(groups = OnCreate.class) Boolean isColorTemperatureAdjustable,
		@Positive Integer colorTemperatureMinK,
		@Positive Integer colorTemperatureMaxK,
		@NotNull(groups = OnCreate.class) Boolean isBrightnessAdjustable,
		@Positive Integer luminousFluxMinLm,
		@Positive Integer luminousFluxMaxLm,
		Distribution distribution,
		@Positive Integer reachMm) {
}
