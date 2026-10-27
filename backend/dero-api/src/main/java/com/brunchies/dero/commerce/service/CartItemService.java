package com.brunchies.dero.commerce.service;

import com.brunchies.dero.commerce.CartItem;
import com.brunchies.dero.commerce.CommerceErrorCode;
import com.brunchies.dero.commerce.dto.CartItemAddRequest;
import com.brunchies.dero.commerce.dto.CartItemQuantityRequest;
import com.brunchies.dero.commerce.dto.CartItemResponse;
import com.brunchies.dero.commerce.repository.CartItemRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 장바구니(REQ-REC-01, {@code api-spec.md} §7). 전부 🔒이고 <b>소유자만</b> 읽고 쓴다.
 *
 * <p><b>같은 제품을 다시 담으면 행이 아니라 수량이 오른다</b> —
 * {@code uq_cart_item_user_id_product_id}가 중복 행을 애초에 막고, 모니터 2대 세팅처럼 같은 제품을
 * 여러 개 사는 경우가 정상이라 수량 컬럼이 답이다. (배치 쪽 {@code placed_item}은 반대로 수량
 * 컬럼이 없다 — 그쪽은 3D 공간의 인스턴스라 위치가 각자 다르기 때문이다.)
 *
 * <p><b>남의 항목은 404다</b>(403이 아니다) — 조회 쿼리에 소유자 조건이 있어 남의 행은 애초에 안
 * 잡히고, 403은 "그 id의 항목이 있다"를 흘린다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class CartItemService {

	/** 담기 한 번이 올리는 수량. 담는 행위 자체가 "한 개"다. */
	private static final int ADD_STEP = 1;

	private final CartItemRepository cartItems;
	private final ProductRepository products;
	private final UserRepository users;
	private final PublicImageUrlResolver publicImageUrl;

	/** 내 장바구니 목록. 대표 이미지는 제품 목록과 같은 방식으로 한 번에 끌어온다(N+1 방지). */
	public List<CartItemResponse> list(Long userId) {
		List<CartItem> mine = cartItems.findMine(userId);
		if (mine.isEmpty()) {
			return List.of();
		}
		Map<Long, ProductImage> primaryImageByProductId = primaryImages(mine);
		return mine.stream()
				.map(item -> response(item, primaryImageByProductId))
				.toList();
	}

	/**
	 * 담기 → 201. <b>이미 담은 제품이면 새 행 없이 수량만 1 오른다.</b>
	 *
	 * <p>소프트 삭제된 제품은 담을 수 없다 — 카탈로그에 없는 것을 장바구니에 넣으면 목록 쿼리가
	 * 곧바로 걸러내 "담았는데 안 보인다"가 된다.
	 */
	@Transactional
	public CartItemResponse add(Long userId, CartItemAddRequest request) {
		Product product = products.findByIdAndDeletedAtIsNull(request.productId())
				.orElseThrow(() -> new BusinessException(CommerceErrorCode.CART_ITEM_UNKNOWN_PRODUCT));

		CartItem item = cartItems.findByUser_IdAndProduct_Id(userId, product.getId())
				.orElse(null);
		if (item == null) {
			item = cartItems.save(CartItem.create(users.getReferenceById(userId), product));
		} else {
			item.increaseQuantity(ADD_STEP);
		}
		return response(item, primaryImages(List.of(item)));
	}

	/** 수량 변경 → 200. 0 이하는 컨트롤러의 {@code @Min(1)}이 400으로 막는다(빼기는 {@code DELETE}). */
	@Transactional
	public CartItemResponse changeQuantity(
			Long userId, Long cartItemId, CartItemQuantityRequest request) {
		CartItem item = owned(userId, cartItemId);
		item.changeQuantity(request.quantity());
		return response(item, primaryImages(List.of(item)));
	}

	/** 빼기 → 204. hard delete다 — 뺀 행을 남기면 같은 제품을 다시 담을 때 유니크 제약에 막힌다. */
	@Transactional
	public void remove(Long userId, Long cartItemId) {
		cartItems.delete(owned(userId, cartItemId));
	}

	private Map<Long, ProductImage> primaryImages(List<CartItem> items) {
		List<Long> productIds = items.stream()
				.map(item -> item.getProduct().getId())
				.distinct()
				.toList();
		return products.findPrimaryImagesByProductIdIn(productIds).stream()
				.collect(Collectors.toMap(image -> image.getProduct().getId(), image -> image));
	}

	private CartItemResponse response(
			CartItem item, Map<Long, ProductImage> primaryImageByProductId) {
		Product product = item.getProduct();
		ProductImage primaryImage = primaryImageByProductId.get(product.getId());
		Integer priceKrw = product.getPriceKrw();
		return new CartItemResponse(
				item.getId(),
				product.getId(),
				product.getName(),
				product.getBrand() == null ? null : product.getBrand().getName(),
				priceKrw,
				primaryImage == null ? null : publicImageUrl.url(primaryImage.getImageKey()),
				product.getProductUrl(),
				item.getQuantity(),
				priceKrw == null ? 0L : (long) priceKrw * item.getQuantity());
	}

	private CartItem owned(Long userId, Long cartItemId) {
		return cartItems.findByIdAndUser_Id(cartItemId, userId)
				.orElseThrow(() -> new BusinessException(CommerceErrorCode.CART_ITEM_NOT_FOUND));
	}
}
