package com.brunchies.dero.placement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.placement.dto.DeskSnapshot;
import com.brunchies.dero.placement.dto.EstimateResponse;
import com.brunchies.dero.placement.dto.ItemSnapshot;
import com.brunchies.dero.placement.dto.PlacementSnapshotRequest;
import com.brunchies.dero.placement.dto.PlacementSummaryResponse;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 견적 합산 규칙(REQ-REC-01)을 배치 저장을 거쳐 <b>실제 행 위에서</b> 검증한다 — 합계는 순수 계산이
 * 아니라 {@code placed_item} 행 수와 {@code placement_desk.spec_source}에 달려 있어서, 엔티티를 손으로
 * 조립해서는 "같은 제품 두 행"이나 "직접 입력 책상"이 진짜 그렇게 저장됐는지 증명되지 않는다.
 */
class PlacementEstimatePersistenceTest extends AbstractPostgresIntegrationTest {

	private static final int MONITOR_PRICE = 350_000;
	private static final int DESK_PRICE = 200_000;

	@Autowired
	private PlacementService placementService;

	@Autowired
	private PlacementEstimateService placementEstimateService;

	@Autowired
	private UserRepository users;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private DeskTextureRepository deskTextures;

	@Autowired
	private ProductRepository products;

	@Autowired
	private EntityManager entityManager;

	private Long ownerId;
	private Long strangerId;
	private Long deskTextureId;
	private Long monitorProductId;
	private Long deskProductId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("estimate@example.com", Provider.KAKAO, "p-est", "주인"))
				.getId();
		strangerId = users.save(User.create("other@example.com", Provider.GOOGLE, "p-oth", "남"))
				.getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		DeskTexture deskTexture = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null,
				null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskTextureId = deskTexture.getId();
		monitorProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"27인치 모니터", null, MONITOR_PRICE, null, 610, 200, 400, 5_500, false,
				MountSurface.TOP)).getId();
		deskProductId = products.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1400 책상", null, DESK_PRICE, null, 1400, 700, 720, 25, 25, false, deskTexture,
				FrameType.T_FRAME, null)).getId();
		flushAndClear();
	}

	@Test
	@DisplayName("같은 제품을 둘 놓으면 합계에 두 번 더해진다 — placed_item에 수량 컬럼이 없다")
	void 같은_제품_두_행이_두_번_더해진다() {
		Long placementId = save(customDesk(), 1_000_000,
				List.of(item("m1", monitorProductId), item("m2", monitorProductId)));

		EstimateResponse estimate = placementEstimateService.estimate(placementId, ownerId);

		assertThat(estimate.totalPriceKrw()).isEqualTo(MONITOR_PRICE * 2L);
	}

	@Test
	@DisplayName("직접 입력 규격 책상은 견적에 없다(D18) — 제품 모드 책상만 합계에 들어간다")
	void 직접_입력_책상은_제외된다() {
		Long customPlacementId = save(customDesk(), null, List.of(item("m1", monitorProductId)));
		Long productPlacementId = save(productDesk(), null, List.of(item("m1", monitorProductId)));

		assertThat(placementEstimateService.estimate(customPlacementId, ownerId).totalPriceKrw())
				.isEqualTo(MONITOR_PRICE);
		assertThat(placementEstimateService.estimate(productPlacementId, ownerId).totalPriceKrw())
				.isEqualTo(MONITOR_PRICE + (long) DESK_PRICE);
	}

	@Test
	@DisplayName("목록 카드의 totalPriceKrw는 예산이 아니라 견적 합계다 — 두 화면이 같은 금액을 말한다")
	void 목록에도_같은_합계가_실린다() {
		// 예산(100만)과 합계(70만)를 일부러 다르게 둔다 — 같으면 예산을 그려도 테스트가 통과한다.
		Long placementId = save(productDesk(), 1_000_000,
				List.of(item("m1", monitorProductId), item("m2", monitorProductId)));

		PlacementSummaryResponse card = placementService
				.list(ownerId, "me", null, List.of(placementId), null, null, null,
						PlacementSort.LATEST, null, null, 10)
				.content()
				.getFirst();

		assertThat(card.totalPriceKrw()).isEqualTo(MONITOR_PRICE * 2L + DESK_PRICE);
		assertThat(card.totalPriceKrw())
				.isEqualTo(placementEstimateService.estimate(placementId, ownerId).totalPriceKrw());
		assertThat(card.budgetKrw()).isEqualTo(1_000_000);
	}

	@Test
	@DisplayName("아이템도 제품 책상도 없는 배치의 합계는 0이다 — 집계 행이 아예 없다")
	void 빈_배치는_0원() {
		Long placementId = save(customDesk(), null, List.of());

		assertThat(placementEstimateService.estimate(placementId, ownerId).totalPriceKrw())
				.isZero();
	}

	@Test
	@DisplayName("예산을 넘으면 isOverBudget=true이고 차액은 음수다")
	void 예산_초과() {
		Long placementId = save(customDesk(), 300_000, List.of(item("m1", monitorProductId)));

		EstimateResponse estimate = placementEstimateService.estimate(placementId, ownerId);

		assertThat(estimate.budgetKrw()).isEqualTo(300_000);
		assertThat(estimate.isOverBudget()).isTrue();
		assertThat(estimate.differenceKrw()).isEqualTo(300_000L - MONITOR_PRICE);
	}

	@Test
	@DisplayName("예산이 없어도 합계는 나온다 — 예산 대비 3필드만 비어 있다")
	void 예산_미설정() {
		Long placementId = save(customDesk(), null, List.of(item("m1", monitorProductId)));

		EstimateResponse estimate = placementEstimateService.estimate(placementId, ownerId);

		assertThat(estimate.totalPriceKrw()).isEqualTo(MONITOR_PRICE);
		assertThat(estimate.budgetKrw()).isNull();
		assertThat(estimate.isOverBudget()).isNull();
		assertThat(estimate.differenceKrw()).isNull();
	}

	@Test
	@DisplayName("남의 비공개 배치 견적은 404다 — 비로그인도 마찬가지다(403이 아니다)")
	void 남의_비공개_배치는_404() {
		Long placementId = save(customDesk(), 1_000_000, List.of(item("m1", monitorProductId)));

		assertNotFound(placementId, strangerId);
		assertNotFound(placementId, null);
	}

	private void assertNotFound(Long placementId, Long userId) {
		assertThatThrownBy(() -> placementEstimateService.estimate(placementId, userId))
				.isInstanceOf(BusinessException.class)
				.hasMessage(PlacementErrorCode.PLACEMENT_NOT_FOUND.code());
	}

	private Long save(DeskSnapshot desk, Integer budgetKrw, List<ItemSnapshot> items) {
		Long placementId = placementService.create(ownerId, new PlacementSnapshotRequest(
				"견적 테스트", null, null, true, null, null, null, budgetKrw,
				desk, items)).id();
		flushAndClear();
		return placementId;
	}

	private DeskSnapshot customDesk() {
		return new DeskSnapshot(SpecSource.CUSTOM, null, 1400, 700, 720, 25, null, deskTextureId,
				FrameType.T_FRAME);
	}

	private DeskSnapshot productDesk() {
		return new DeskSnapshot(SpecSource.PRODUCT, deskProductId, 1400, 700, 720, 25, null,
				deskTextureId, FrameType.T_FRAME);
	}

	private ItemSnapshot item(String ref, Long productId) {
		return new ItemSnapshot(ref, null, productId, -200, 720, -150, BigDecimal.ZERO,
				BigDecimal.ZERO, MountSurface.TOP, null, null, Map.of(), null);
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
