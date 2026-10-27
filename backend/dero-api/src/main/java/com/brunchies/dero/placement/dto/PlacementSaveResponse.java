package com.brunchies.dero.placement.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 저장 응답(ADR-0009 결정 6). {@code POST}는 201 + {@code Location}, {@code PUT}은 200이고 본문은 같다.
 *
 * <p>{@code version}·{@code updatedAt}은 다음 저장 요청에 그대로 실어 보낸다 — 그래야 낙관적 락이
 * 전진한다. {@code items}는 {@code ref → id} 매핑이고 {@code violations}는 서버 정본 판정이다.
 */
public record PlacementSaveResponse(
		Long id,
		OffsetDateTime updatedAt,
		Long version,
		List<ItemRefMapping> items,
		List<ViolationResponse> violations) {
}
