package com.brunchies.dero.placement.judgment;

import java.util.List;

/**
 * 판정 ②의 암 쪽 입력 — VESA 규격 목록과 허용 하중.
 *
 * <p>판정 ①의 {@link ClampSpec}과 일부러 갈라 뒀다. 두 판정은 축이 다르고, 한 레코드로 합치면 판정
 * ①만 필요한 호출부가 VESA를 채우게 되어 "안 쓰는 값을 채운 입력"이 생긴다.
 *
 * @param vesa 지원 VESA 규격. 빈 목록은 미등록
 * @param loadCapacityG 허용 하중(g, {@code arm.allowed_load_g}). NULL·비양수는 미등록
 */
public record ArmMountSpec(List<String> vesa, Integer loadCapacityG) {

	public ArmMountSpec {
		vesa = vesa == null ? List.of() : List.copyOf(vesa);
	}
}
