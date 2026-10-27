package com.brunchies.dero.placement.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * {@code POST /api/v1/compatibility/judgments} 요청 — <b>저장하지 않는 계산</b>(api-spec.md §8).
 *
 * <p>배치를 만들지 않고 "이 조합이 되나"만 묻는 자리라 {@code placementId}가 없다. 응답은 200이고
 * {@code judgment_result} 행도, 어떤 행도 만들지 않는다(ADR-0004 "판정 결과 저장 — 안 함").
 *
 * @param desk 책상 쪽 규격(제품 모드 / 직접 입력 모드)
 * @param items 판정할 아이템들. 빈 목록이면 판정 행도 비어 나간다
 */
public record JudgmentRequest(
		@Valid @NotNull JudgmentDeskRequest desk,
		@Valid @NotNull List<JudgmentItemRequest> items) {
}
