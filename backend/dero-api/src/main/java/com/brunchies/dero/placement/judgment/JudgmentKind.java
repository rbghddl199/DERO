package com.brunchies.dero.placement.judgment;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 판정 3종({@code docs/context/compatibility.md} "확정 규칙"). 어떤 규칙이 돌았는지를 화면·응답이
 * 구분해야 해서 결과({@link JudgmentResult})와 별개 축으로 둔다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum JudgmentKind {

	ARM_DESK("① 암↔책상 — 클램프 물림 범위 vs 클램프 물림 두께."),

	MONITOR_ARM("② 모니터↔암 — VESA 일치 + 무게 vs 허용 하중."),

	PROP_DESK("③ 소품↔책상 — 상판 면적 안에 들어가는가.");

	private final String description;
}
