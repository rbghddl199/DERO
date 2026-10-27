package com.brunchies.dero.commerce.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 장바구니 담기 요청({@code POST /cart-items}).
 *
 * <p><b>수량을 받지 않는다</b> — 담는 행위 자체가 "한 개"이고, 이미 담은 제품을 다시 담으면 행이
 * 늘지 않고 수량이 1 오른다({@code uq_cart_item_user_id_product_id}). 수량을 직접 정하는 자리는
 * {@code PATCH /cart-items/{id}} 하나다.
 */
public record CartItemAddRequest(@NotNull Long productId) {
}
