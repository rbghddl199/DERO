package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.PlacementWall;
import com.brunchies.dero.placement.WallSide;

/**
 * 상세 응답의 벽면 하나 — 저장한 마감·표시 여부·창문을 그대로 복원한다(REQ-ENV-08·10).
 * 항상 좌·전면·우 3개가 이 순서로 실린다.
 */
public record WallDetailResponse(
		WallSide wallSide,
		boolean isOn,
		int distanceMm,
		String material,
		String variant,
		boolean hasWindow,
		Integer windowCenterXMm,
		Integer windowCenterYMm,
		Integer windowWidthMm,
		Integer windowHeightMm) {

	public static WallDetailResponse from(PlacementWall wall) {
		return new WallDetailResponse(
				wall.getWallSide(),
				wall.isOn(),
				wall.getDistanceMm(),
				wall.getMaterial(),
				wall.getVariant(),
				wall.isHasWindow(),
				wall.getWindowCenterXMm(),
				wall.getWindowCenterYMm(),
				wall.getWindowWidthMm(),
				wall.getWindowHeightMm());
	}
}
