package com.brunchies.dero.placement.judgment;

/**
 * 판정 ①의 책상 쪽 입력 — <b>클램프 물림 두께의 두 원본</b>이다(D21, 2026-07-23 확정).
 *
 * <p>파생값 {@code max(상판, 엣지 마감)}은 <b>저장 컬럼이 아니라 WAS 파생값</b>이다. 두 원본이 정본이고
 * 파생값을 DB에 굳히면 원본을 고친 날 조용히 어긋난다 — 그래서 여기서도 두 값을 그대로 받고
 * {@link #gripThicknessMm()}이 그때그때 계산한다.
 *
 * <p><b>{@code edgeThicknessMm}의 NULL은 0이 아니라 "상판 두께와 같음"이다</b>
 * ({@code placement_desk.edge_thickness_mm}는 nullable, {@code desk.edge_thickness_mm}는 NOT NULL).
 * 0으로 읽으면 {@code max}의 입력이 조용히 틀어진다.
 *
 * @param topThicknessMm 상판 두께
 * @param edgeThicknessMm 엣지 마감 두께. NULL이면 상판 두께로 COALESCE한다
 */
public record GripSpec(int topThicknessMm, Integer edgeThicknessMm) {

	/** 결측을 상판 두께로 메운 엣지 두께. */
	public int effectiveEdgeThicknessMm() {
		return edgeThicknessMm == null ? topThicknessMm : edgeThicknessMm;
	}

	/** 판정 ①의 실제 입력 — {@code max(상판, 엣지 마감)}. */
	public int gripThicknessMm() {
		return Math.max(topThicknessMm, effectiveEdgeThicknessMm());
	}

	/**
	 * 물림 두께가 <b>어느 쪽에서 나왔는지</b>. 사유 문구에 파생값과 같이 낸다 — 파생값만 내면 사용자가
	 * 상판 두께만 보고 "왜 불가냐"고 되묻는다(D21).
	 */
	public String gripSourceLabel() {
		return effectiveEdgeThicknessMm() > topThicknessMm ? "엣지 마감" : "상판";
	}
}
