package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 카탈로그 노출 여부.
 *
 * <p><b>{@link com.brunchies.dero.product.ReviewStatus}와 다른 축이다</b> — 이쪽은 운영진이 제품을
 * 내렸는지, 저쪽은 GLB·규격 검수 단계다. 자작 제품이 남에게 보이려면 {@code ACTIVE} <b>그리고</b> {@code APPROVED} 둘 다여야
 * 한다({@code docs/context/erd.md} {@code product} 절).
 *
 * <p>제품을 카탈로그에서 내릴 때 {@code deleted_at}이 아니라 {@code HIDDEN}을 쓴다 — 참조가 살아 있는
 * 제품을 soft delete하면 그 제품을 쓴 기존 배치가 로드되지 않는다(ADR-0006 결정 7).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ProductStatus {
    ACTIVE("카탈로그에 노출된다."),
    HIDDEN("카탈로그에서 내렸다. 참조가 살아 있어 deleted_at 대신 이 값을 쓴다.");

    private final String description;
}
