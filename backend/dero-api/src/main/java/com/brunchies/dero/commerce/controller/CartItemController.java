package com.brunchies.dero.commerce.controller;

import com.brunchies.dero.commerce.dto.CartItemAddRequest;
import com.brunchies.dero.commerce.dto.CartItemQuantityRequest;
import com.brunchies.dero.commerce.dto.CartItemResponse;
import com.brunchies.dero.commerce.service.CartItemService;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 장바구니({@code api-spec.md} §7). 전부 🔒 — {@code SecurityConfig}의 기본값
 * {@code anyRequest().authenticated()}가 그대로 적용되므로 따로 열지 않는다.
 *
 * <p><b>경로는 톱레벨 {@code /cart-items}다</b> — {@code cart} 테이블이 없다(사용자당 하나라
 * {@code user_id}뿐인 껍데기가 된다). 없는 리소스를 URL이 있다고 말하지 않으려고
 * {@code /carts/{id}/items} 형태를 만들지 않았다.
 *
 * <p>목록은 커서 페이지가 아니다 — 사용자가 손으로 담는 목록이라 화면에 다 들어온다.
 */
@RestController
@RequestMapping("/api/v1/cart-items")
@RequiredArgsConstructor
public class CartItemController {

	private final CartItemService cartItemService;

	@GetMapping
	public ResponseEntity<List<CartItemResponse>> list(Authentication authentication) {
		return ResponseEntity.ok(cartItemService.list(AuthenticatedUserId.orNull(authentication)));
	}

	/**
	 * 담기 → 201 + {@code Location}.
	 *
	 * <p><b>이미 담은 제품을 다시 담아도 201이다</b> — 행이 새로 생기지 않고 수량이 오를 뿐이지만,
	 * 호출자 입장에서 "이 제품이 장바구니의 이 주소에 있다"는 결과는 같다. 200/201을 가르면
	 * 프론트가 담기 버튼 하나를 두 갈래로 처리해야 하고 얻는 정보가 없다.
	 */
	@PostMapping
	public ResponseEntity<CartItemResponse> add(
			Authentication authentication, @Valid @RequestBody CartItemAddRequest request) {
		CartItemResponse response =
				cartItemService.add(AuthenticatedUserId.orNull(authentication), request);
		return ResponseEntity
				.created(URI.create("/api/v1/cart-items/" + response.id()))
				.body(response);
	}

	/** 수량 변경 → 200. 0 이하는 {@code @Valid}가 400으로 막는다 — 빼기는 {@code DELETE}다. */
	@PatchMapping("/{cartItemId}")
	public ResponseEntity<CartItemResponse> changeQuantity(
			Authentication authentication,
			@PathVariable Long cartItemId,
			@Valid @RequestBody CartItemQuantityRequest request) {
		return ResponseEntity.ok(cartItemService.changeQuantity(
				AuthenticatedUserId.orNull(authentication), cartItemId, request));
	}

	/** 빼기 → 204. 남의 항목을 지우려 하면 404이고 그 항목은 그대로 남는다. */
	@DeleteMapping("/{cartItemId}")
	public ResponseEntity<Void> remove(
			Authentication authentication, @PathVariable Long cartItemId) {
		cartItemService.remove(AuthenticatedUserId.orNull(authentication), cartItemId);
		return ResponseEntity.noContent().build();
	}
}
