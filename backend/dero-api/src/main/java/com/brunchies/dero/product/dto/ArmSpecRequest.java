package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ArmKind;
import com.brunchies.dero.product.ArmType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 모니터암·마이크암 규격 입력. 등록(POST)·수정(PATCH)이 공유하고 필수 여부를 {@link OnCreate} 그룹이
 * 가른다.
 *
 * <p><b>마운트 3종을 평평하게 받는다</b> — 엔티티는 {@code ArmMounting} 값 객체로 묶여 있지만 그
 * 묶음의 목적은 "위치 인자 순서 뒤바뀜 방지"라 JSON 본문에는 이득이 없다(JSON은 키로 찾는다).
 * 서비스가 세 값을 모아 {@code ArmMounting}을 만든다.
 *
 * <p>{@code armKind = MIC} · {@code armType = STAND} 조합 규칙은 {@code Arm} 엔티티가 강제한다 —
 * PATCH가 부분 입력이라 요청 본문만으로는 판단할 수 없기 때문이다.
 */
public record ArmSpecRequest(
		@NotNull(groups = OnCreate.class) ArmKind armKind,
		@NotNull(groups = OnCreate.class) ArmType armType,
		@NotNull(groups = OnCreate.class) @Positive Integer deviceCapacity,
		@Positive Integer segmentCount,
		@Positive Integer poleHeightMm,
		@Positive Integer reachMinMm,
		@Positive Integer reachMaxMm,
		@Positive Integer heightMinMm,
		@Positive Integer heightMaxMm,
		@NotNull(groups = OnCreate.class) Boolean isClampMountable,
		@NotNull(groups = OnCreate.class) Boolean isGrommetMountable,
		@NotNull(groups = OnCreate.class) Boolean isWallMountable,
		@Positive Integer clampMinMm,
		@Positive Integer clampMaxMm,
		Integer tiltMinDeg,
		Integer tiltMaxDeg,
		Integer swivelRangeDeg,
		Integer pivotRangeDeg,
		@NotNull(groups = OnCreate.class) Boolean isVesaPlateDetachable,
		@NotNull(groups = OnCreate.class) Boolean hasCableManagement,
		@NotNull(groups = OnCreate.class) @Positive Integer allowedLoadG) {
}
