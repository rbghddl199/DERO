package com.brunchies.dero.commerce.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.commerce.CommerceErrorCode;
import com.brunchies.dero.commerce.dto.CartItemAddRequest;
import com.brunchies.dero.commerce.dto.CartItemQuantityRequest;
import com.brunchies.dero.commerce.dto.CartItemResponse;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 장바구니의 <b>행 수준</b> 규칙을 못 박는다 — "다시 담으면 수량이 오른다"는 응답의 {@code quantity}만
 * 봐서는 증명되지 않는다({@code uq_cart_item_user_id_product_id}에 막혀 실패하는지, 새 행이 생기는지,
 * 정말 같은 행이 올랐는지가 안 보인다). 행 개수와 id를 같이 본다.
 */
class CartItemServicePersistenceTest extends AbstractPostgresIntegrationTest {

	private static final int PRICE = 350_000;

	@Autowired
	private CartItemService cartItemService;

	@Autowired
	private UserRepository users;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private ProductRepository products;

	@Autowired
	private EntityManager entityManager;

	private Long ownerId;
	private Long strangerId;
	private Long productId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("cart@example.com", Provider.KAKAO, "p-cart", "주인"))
				.getId();
		strangerId = users.save(User.create("other@example.com", Provider.GOOGLE, "p-oth", "남"))
				.getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		productId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"27인치 모니터", null, PRICE, null, 610, 200, 400, 5_500, false, MountSurface.TOP))
				.getId();
		flushAndClear();
	}

	@Test
	@DisplayName("이미 담은 제품을 다시 담으면 행이 늘지 않고 수량이 오른다")
	void 재담기는_수량_증가() {
		CartItemResponse first = cartItemService.add(ownerId, new CartItemAddRequest(productId));
		flushAndClear();
		CartItemResponse second = cartItemService.add(ownerId, new CartItemAddRequest(productId));
		flushAndClear();

		assertThat(second.id()).as("같은 행이어야 한다").isEqualTo(first.id());
		assertThat(second.quantity()).isEqualTo(2);
		assertThat(rowCount(ownerId)).isEqualTo(1);
		assertThat(cartItemService.list(ownerId))
				.singleElement()
				.satisfies(item -> {
					assertThat(item.quantity()).isEqualTo(2);
					assertThat(item.lineTotalKrw()).isEqualTo(PRICE * 2L);
				});
	}

	@Test
	@DisplayName("수량 변경은 그 행만 바꾼다 — 0 이하는 엔티티가 막는다(경로는 컨트롤러 @Min(1))")
	void 수량_변경() {
		Long cartItemId = cartItemService.add(ownerId, new CartItemAddRequest(productId)).id();
		flushAndClear();

		CartItemResponse changed = cartItemService.changeQuantity(
				ownerId, cartItemId, new CartItemQuantityRequest(5));
		flushAndClear();

		assertThat(changed.quantity()).isEqualTo(5);
		assertThat(changed.lineTotalKrw()).isEqualTo(PRICE * 5L);
		assertThatThrownBy(() -> cartItemService.changeQuantity(
				ownerId, cartItemId, new CartItemQuantityRequest(0)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	@DisplayName("남의 장바구니 항목은 수량 변경·빼기가 404이고 항목이 그대로 남는다")
	void 남의_항목은_손댈_수_없다() {
		Long cartItemId = cartItemService.add(ownerId, new CartItemAddRequest(productId)).id();
		flushAndClear();

		assertNotFound(() -> cartItemService.changeQuantity(
				strangerId, cartItemId, new CartItemQuantityRequest(9)));
		assertNotFound(() -> cartItemService.remove(strangerId, cartItemId));
		flushAndClear();

		assertThat(rowCount(ownerId)).isEqualTo(1);
		assertThat(cartItemService.list(ownerId)).singleElement()
				.satisfies(item -> assertThat(item.quantity()).isEqualTo(1));
		assertThat(cartItemService.list(strangerId)).isEmpty();
	}

	@Test
	@DisplayName("빼면 행이 지워지고 같은 제품을 다시 담을 수 있다 — soft delete면 유니크에 막힌다")
	void 빼고_다시_담기() {
		Long cartItemId = cartItemService.add(ownerId, new CartItemAddRequest(productId)).id();
		flushAndClear();

		cartItemService.remove(ownerId, cartItemId);
		flushAndClear();
		assertThat(rowCount(ownerId)).isZero();

		CartItemResponse again = cartItemService.add(ownerId, new CartItemAddRequest(productId));
		flushAndClear();

		assertThat(again.quantity()).isEqualTo(1);
		assertThat(rowCount(ownerId)).isEqualTo(1);
	}

	@Test
	@DisplayName("없는 제품은 담을 수 없다")
	void 없는_제품() {
		assertThatThrownBy(() -> cartItemService.add(ownerId, new CartItemAddRequest(9_999_999L)))
				.isInstanceOf(BusinessException.class)
				.hasMessage(CommerceErrorCode.CART_ITEM_UNKNOWN_PRODUCT.code());
	}

	@Test
	@DisplayName("빈 장바구니는 빈 목록이다")
	void 빈_장바구니() {
		assertThat(cartItemService.list(ownerId)).isEqualTo(List.of());
	}

	private void assertNotFound(Runnable call) {
		assertThatThrownBy(call::run)
				.isInstanceOf(BusinessException.class)
				.hasMessage(CommerceErrorCode.CART_ITEM_NOT_FOUND.code());
	}

	private long rowCount(Long userId) {
		return entityManager
				.createQuery("select count(c) from CartItem c where c.user.id = :id", Long.class)
				.setParameter("id", userId)
				.getSingleResult();
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
