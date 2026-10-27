package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.PlacedItem;
import com.brunchies.dero.placement.WallSide;
import com.brunchies.dero.product.MountSurface;
import java.math.BigDecimal;
import java.util.Map;

/**
 * 상세 응답의 배치 아이템 1개. 저장 요청({@link ItemSnapshot})과 대칭이지만 <b>{@code ref}가 없고</b>
 * 결합 대상이 클라이언트 로컬 키가 아니라 실제 {@code placed_item.id}({@code mountedToItemId})로 나간다
 * — 다시 저장할 때 클라이언트가 이 id들을 자기 {@code ref}로 되매핑한다.
 */
public record ItemDetailResponse(
		Long id,
		Long productId,
		int positionXMm,
		int positionYMm,
		int positionZMm,
		BigDecimal rotationDeg,
		BigDecimal pitchDeg,
		MountSurface surfaceType,
		WallSide wallSide,
		boolean isVesaMounted,
		Long mountedToItemId,
		Map<String, Double> jointValues,
		String emitterColor) {

	public static ItemDetailResponse from(PlacedItem item) {
		return new ItemDetailResponse(
				item.getId(),
				item.getProduct().getId(),
				item.getPositionXMm(),
				item.getPositionYMm(),
				item.getPositionZMm(),
				item.getRotationDeg(),
				item.getPitchDeg(),
				item.getSurfaceType(),
				item.getWallSide(),
				item.isVesaMounted(),
				item.getMountedToPlacedItem() == null ? null : item.getMountedToPlacedItem().getId(),
				item.getJointValues(),
				item.getEmitterColor());
	}
}
