package com.brunchies.dero.placement.dto;

import java.util.List;

/**
 * {@code POST /api/v1/compatibility/judgments} 응답 — 200이고 만들어진 리소스가 없어
 * {@code Location}도 없다(api-spec.md §1 규칙 1⑵).
 *
 * @param judgments 수행한 판정 행들. 수행하지 않은 조합은 여기 없다
 */
public record JudgmentResponse(List<JudgmentRowResponse> judgments) {
}
