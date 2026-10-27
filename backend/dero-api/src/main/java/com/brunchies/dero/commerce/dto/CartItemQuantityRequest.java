package com.brunchies.dero.commerce.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 장바구니 수량 변경 요청({@code PATCH /cart-items/{id}}).
 *
 * <p><b>0 이하는 400이다</b>({@code @Min(1)}) — 빼기는 {@code DELETE}다. 0을 삭제로 해석해 주면
 * 같은 일을 두 방식으로 하게 되고, 수량 0인 행이 남으면 장바구니 화면과 DB가 서로 다른 말을 한다.
 */
public record CartItemQuantityRequest(@NotNull @Min(1) Integer quantity) {
}
