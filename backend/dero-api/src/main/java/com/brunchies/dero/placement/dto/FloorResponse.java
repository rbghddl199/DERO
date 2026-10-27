package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.Placement;

/** 상세 응답의 바닥 마감 — 컬럼이 NOT NULL이라 NULL이 나올 수 없다. */
public record FloorResponse(String material, String variant) {

	public static FloorResponse from(Placement placement) {
		return new FloorResponse(placement.getFloorMaterial(), placement.getFloorVariant());
	}
}
