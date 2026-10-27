package com.brunchies.dero.placement.judgment;

import java.util.List;

/**
 * 판정 ②의 모니터 쪽 입력 — VESA 규격 목록과 무게.
 *
 * <p><b>VESA는 {@code "100x100"} 형태의 문자열 목록이다</b>({@code product_vesa} 정션 →
 * {@code vesa_spec} 을 {@code 폭x높이}로 조립한 것). 결측은 NULL이 아니라 <b>빈 목록</b>이다 —
 * 정션에 행이 없는 것이 곧 미등록이다.
 *
 * @param vesa 지원 VESA 규격. 빈 목록은 미등록
 * @param weightG 무게(g). NULL·비양수는 미등록. <b>g로 비교하고 kg로만 표시한다</b>
 */
public record MonitorMountSpec(List<String> vesa, Integer weightG) {

	public MonitorMountSpec {
		vesa = vesa == null ? List.of() : List.copyOf(vesa);
	}
}
