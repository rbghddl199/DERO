package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.repository.ProductLikeRepository;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 제품 찜의 <b>멱등성(경합 경로 포함)</b>과 <b>내가 찜한 제품 목록</b>을 진짜 Postgres 위에서 못 박는다
 * (DERO-356).
 *
 * <p><b>여기서만 볼 수 있는 것</b>: 멱등을 판정하는 주체가 애플리케이션의 {@code exists}가 아니라
 * {@code uq_product_like_user_id_product_id}라는 사실. 옛 구조는 검사와 INSERT 사이에 다른 요청이
 * 끼어들면 예외를 삼켜도 커밋에서 500이 났고, 그 경로는 <b>단일 스레드 응답 테스트로는 재현되지
 * 않았다</b>(DERO-342 보고 "알아야 할 것" 1). 지금은 같은 INSERT를 두 번 실행해도 예외 자체가
 * 없다 — 두 번째가 0행을 돌려줄 뿐이다.
 */
class ProductLikeServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private ProductLikeService productLikeService;

	@Autowired
	private ProductLikeRepository productLikes;

	@Autowired
	private ProductRepository products;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private DeskTextureRepository deskTextures;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long userId;
	private Long otherUserId;
	private Long firstProductId;
	private Long secondProductId;

	@BeforeEach
	void setUp() {
		userId = users.save(User.create("like-me@example.com", Provider.KAKAO, "p-like-me", "나")).getId();
		otherUserId =
				users.save(User.create("like-other@example.com", Provider.KAKAO, "p-like-other", "남")).getId();

		Category category = categories.save(Category.createRoot("책상", null, 1));
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		firstProductId = saveDesk(category, texture, "먼저 찜한 책상");
		secondProductId = saveDesk(category, texture, "나중에 찜한 책상");

		flushAndClear();
	}

	@Test
	@DisplayName("같은 제품을 두 번 찜해도 예외 없이 행은 1개다 — 두 번째 INSERT는 0행이다")
	void 찜_멱등() {
		productLikeService.like(userId, firstProductId);
		productLikeService.like(userId, firstProductId);
		flushAndClear();

		assertThat(likeRowCount(firstProductId)).isEqualTo(1);
		assertThat(productLikeService.get(userId, firstProductId))
				.isEqualTo(new LikeStateResponse(true, 1));
	}

	@Test
	@DisplayName("경합 재현 — 같은 INSERT를 연달아 실행해도 두 번째가 0행일 뿐 예외가 없다")
	void 경합_INSERT_중복_실행() {
		assertThat(productLikes.insertIgnoringDuplicate(userId, firstProductId)).isEqualTo(1);
		assertThat(productLikes.insertIgnoringDuplicate(userId, firstProductId)).isZero();
		flushAndClear();

		assertThat(likeRowCount(firstProductId)).isEqualTo(1);
	}

	@Test
	@DisplayName("찜을 풀었다가 다시 찜할 수 있다 — hard delete라 유니크 제약에 막히지 않는다")
	void 재찜() {
		productLikeService.like(userId, firstProductId);
		productLikeService.unlike(userId, firstProductId);
		productLikeService.like(userId, firstProductId);
		flushAndClear();

		assertThat(likeRowCount(firstProductId)).isEqualTo(1);
	}

	@Test
	@DisplayName("내가 찜한 제품만, 최근 찜한 순서로 나온다")
	void 찜_목록() {
		productLikeService.like(userId, firstProductId);
		productLikeService.like(userId, secondProductId);
		productLikeService.like(otherUserId, firstProductId);
		flushAndClear();

		CursorPage<ProductDetailResponse> page = productLikeService.listLiked(userId, null, 20);

		assertThat(page.content()).extracting(ProductDetailResponse::id)
				.containsExactly(secondProductId, firstProductId);
		assertThat(page.totalCount()).isEqualTo(2);
		assertThat(page.hasNext()).isFalse();
		assertThat(page.nextCursor()).isNull();
	}

	@Test
	@DisplayName("찜 목록 커서 — 첫 페이지 뒤를 이어 받고 중복·누락이 없다")
	void 찜_목록_커서() {
		productLikeService.like(userId, firstProductId);
		productLikeService.like(userId, secondProductId);
		flushAndClear();

		CursorPage<ProductDetailResponse> first = productLikeService.listLiked(userId, null, 1);
		assertThat(first.content()).extracting(ProductDetailResponse::id).containsExactly(secondProductId);
		assertThat(first.hasNext()).isTrue();

		CursorPage<ProductDetailResponse> second =
				productLikeService.listLiked(userId, first.nextCursor(), 1);
		assertThat(second.content()).extracting(ProductDetailResponse::id).containsExactly(firstProductId);
		assertThat(second.hasNext()).isFalse();
	}

	@Test
	@DisplayName("아무것도 안 찜했으면 빈 목록이다")
	void 찜_목록_없음() {
		CursorPage<ProductDetailResponse> page = productLikeService.listLiked(userId, null, 20);

		assertThat(page.content()).isEmpty();
		assertThat(page.totalCount()).isZero();
		assertThat(page.hasNext()).isFalse();
	}

	private Long saveDesk(Category category, DeskTexture texture, String name) {
		return products.save(Desk.create(ProductSource.CATALOG, null, null, category, name, null,
				250_000, null, 1400, 700, 720, 25, 30, false, texture, FrameType.T_FRAME, null)).getId();
	}

	private long likeRowCount(Long productId) {
		return entityManager
				.createQuery("select count(l) from ProductLike l where l.product.id = :id", Long.class)
				.setParameter("id", productId)
				.getSingleResult();
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
