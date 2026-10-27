package com.brunchies.dero.placement.dto;

/**
 * 서버 정본 판정의 위반 1건(ADR-0009 결정 6). 저장은 위반이 있어도 성공하고(2xx) 이 목록만 실린다 —
 * 게이트는 공개({@code PUT /placements/{id}/feed-entry})에 걸려 있다(ADR-0009 결정 5).
 *
 * <p><b>2026-08-01부터 실제로 채워진다</b>(DERO-338) — {@code PlacementJudge}가 저장 병합 뒤에
 * 배치 전체를 다시 판정하고 그중 {@code INCOMPATIBLE}만 여기 실린다. {@code CONDITIONAL}(규격 미등록)은
 * 위반이 아니라 안내라 빠진다 — 전체 판정 행이 필요하면 {@code POST /compatibility/judgments}다.
 *
 * @param code {@code <판정 종류>_<결과>} 형태({@code ARM_DESK_INCOMPATIBLE} 등). 프론트가 분기할 키다
 * @param itemId 위반한 {@code placed_item.id}
 * @param message 근거 수치가 든 한국어 사유. 사유가 여럿이면 {@code " · "}로 잇는다
 */
public record ViolationResponse(String code, Long itemId, String message) {
}
