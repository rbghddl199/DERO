package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.MountSurface;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 소품 규격 입력 — 규격 4종에 들어가지 않는 나머지 전부. 등록(POST)·수정(PATCH)이 공유하고 필수
 * 여부를 {@link OnCreate} 그룹이 가른다.
 *
 * <p>{@code isStackable}은 REQ-SIM-02 스태킹 스냅의 입력이라 등록 필수다 — 미입력이 "아니오"로
 * 둔갑하면 스냅이 틀린 답을 낸다.
 */
public record PropSpecRequest(
		@NotNull(groups = OnCreate.class) @Positive Integer widthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer depthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer heightMm,
		@Positive Integer weightG,
		@NotNull(groups = OnCreate.class) Boolean isStackable,
		@NotNull(groups = OnCreate.class) MountSurface mountSurface) {
}
