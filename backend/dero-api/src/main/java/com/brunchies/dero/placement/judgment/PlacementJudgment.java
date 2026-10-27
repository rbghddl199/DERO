package com.brunchies.dero.placement.judgment;

/**
 * 배치 재판정 결과 1행 — "어떤 규칙이 어느 아이템에 대해 무엇을 냈나".
 *
 * <p><b>행이 없는 것과 불가는 다르다</b> — {@code is_clamp_mountable = false}인 암은 이 목록에 아예
 * 안 실린다. 소비자가 "판정 목록"을 그리는 것이지 "아이템 목록"을 그리는 게 아니라는 뜻이다.
 *
 * @param kind 판정 3종 중 무엇
 * @param itemId 판정 대상 {@code placed_item.id}
 * @param targetItemId 상대 {@code placed_item.id}. 판정 ②의 암이 여기 온다. 책상 상대면 NULL
 * @param judgment 결과 3값 + 근거 수치 사유
 */
public record PlacementJudgment(
		JudgmentKind kind, Long itemId, Long targetItemId, Judgment judgment) {
}
