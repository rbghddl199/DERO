package com.brunchies.dero.placement.judgment;

import java.util.List;

/**
 * 판정 1건 — 결과 3값 + <b>근거 수치가 든 사유 문구</b>(REQ-CMP-04 Must).
 *
 * <p>사유는 화면에 그대로 나가는 한국어다. 언어 중립 fixture
 * ({@code frontend/tests/fixtures/judgment.json})는 문구 전문이 아니라 <b>부분 문자열</b>만 못 박고,
 * 전문은 TS 미러({@code frontend/src/three/core/collision.ts})와 이 클래스가 같이 진다.
 *
 * @param result 3값 고정
 * @param reasons 근거 수치 포함 사유. {@link JudgmentResult#FIT}이면 빈 목록
 */
public record Judgment(JudgmentResult result, List<String> reasons) {

	public Judgment {
		reasons = List.copyOf(reasons);
	}

	public static Judgment fit() {
		return new Judgment(JudgmentResult.FIT, List.of());
	}

	public static Judgment conditional(List<String> reasons) {
		return new Judgment(JudgmentResult.CONDITIONAL, reasons);
	}

	public static Judgment incompatible(List<String> reasons) {
		return new Judgment(JudgmentResult.INCOMPATIBLE, reasons);
	}
}
