package com.brunchies.dero.placement.dto;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import jakarta.validation.constraints.Pattern;

/**
 * 씬 스냅샷의 바닥 마감(ADR-0030). 바닥은 면이 하나라 벽과 달리 목록이 아니다 — 저장도
 * {@code placement.floor_material}·{@code floor_variant} 컬럼이다.
 *
 * <p>형식만 검증하고 값 화이트리스트를 두지 않는 방침은 {@link WallSnapshot}과 같다.
 */
public record FloorSnapshot(
		@Pattern(regexp = "^[A-Z][A-Z0-9_]{0,29}$") String material,
		@Pattern(regexp = "^[A-Z][A-Z0-9_]{0,29}$") String variant) {

	/** 둘 다 생략했을 때만 기본값(이관 매핑의 {@code neutral} 바닥) — 한쪽만은 {@link #validate()}가 거절한다. */
	public FloorSnapshot {
		if (material == null && variant == null) {
			material = Placement.DEFAULT_FLOOR_MATERIAL;
			variant = Placement.DEFAULT_FLOOR_VARIANT;
		}
	}

	/** 쌍 강제 사유는 {@link WallSnapshot#validate()}와 같다(규칙 15 예외 — 조건부 필수). */
	public void validate() {
		if (material == null || variant == null) {
			// 벽과 다른 코드다 — 프론트가 code로 분기해 틀린 편집기를 강조하면 안 된다.
			throw new BusinessException(PlacementErrorCode.PLACEMENT_FLOOR_FINISH_PAIR_REQUIRED);
		}
	}
}
