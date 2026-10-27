package com.brunchies.dero.placement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 즉답 판정 요청의 아이템 1개. {@link ItemSnapshot}과 같은 {@code ref} 규약을 쓰되 <b>판정에 필요한
 * 셋만</b> 받는다 — 좌표·회전·관절은 규격 판정의 입력이 아니다(공간 겹침은 {@code collider.ts} 소관).
 *
 * <p><b>판정 결과를 받는 필드는 없다.</b> 클라이언트가 본문에 실어 보내도 매핑될 자리가 없어 그대로
 * 버려진다 — 서버가 정본이고 클라이언트 판정은 신뢰하지도 저장하지도 않는다(ADR-0004).
 *
 * @param ref 클라이언트 로컬 키. 응답이 이 키로 판정 행을 돌려준다
 * @param productId 카탈로그 제품 id
 * @param mountedToRef VESA로 물릴 대상의 {@code ref}. NULL이면 결합하지 않는다 — 판정 ②는 이 값이
 *     있을 때만 돈다
 */
public record JudgmentItemRequest(
		@NotBlank String ref,
		@NotNull Long productId,
		String mountedToRef) {
}
