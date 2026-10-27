package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ReviewResult;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code PUT /admin/products/{id}/review} 요청 — 승인·반려(REQ-ADM-04).
 *
 * <p><b>{@code REJECTED}면 {@code note}가 필수다</b>({@code review_note}는 반려일 때만 유효하다,
 * erd.md {@code asset} 절). 조건부라 Bean Validation으로 표현되지 않아 서비스가
 * {@code PRODUCT_REVIEW_NOTE_REQUIRED}로 거절한다 — 사유 없는 반려는 업로더가 무엇을 고쳐야 할지
 * 알 수 없어 재업로드 루프가 무한해진다.
 *
 * <p><b>PUT인 이유</b>: 같은 결과를 두 번 보내도 결과가 같다(멱등). 검수 결과는 "상태가 남는 것"이라
 * 하위 리소스 + PUT이고, 동사 경로({@code /approve})를 만들지 않는다(api-spec §1 규칙 1).
 */
public record AdminProductReviewRequest(
		@NotNull ReviewResult result,
		@Size(max = 500) String note) {
}
