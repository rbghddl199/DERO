package com.brunchies.dero.placement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.dto.DeskSnapshot;
import com.brunchies.dero.placement.dto.ItemSnapshot;
import com.brunchies.dero.placement.dto.PlacementDetailResponse;
import com.brunchies.dero.placement.dto.PlacementSaveResponse;
import com.brunchies.dero.placement.dto.PlacementSnapshotRequest;
import com.brunchies.dero.placement.dto.WallSnapshot;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.placement.service.PlacementService;
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
 * 리믹스 복사의 <b>SQL 수준 결과</b>를 못 박는다.
 *
 * <p>핵심은 결합 재매핑이다 — 복사본의 {@code mounted_to_placed_item_id}가 <b>복사본 안의 암</b>을
 * 가리켜야 하고 원본 아이템 id를 가리키면 안 된다. 응답만 봐서는 판정할 수 없다(상세 응답의
 * {@code mountedToPlacedItemId}가 원본 것이어도 형식은 멀쩡하다). 어긋나면 두 배치가 한 그래프로
 * 엮여 원본을 고칠 때 남의 복사본이 따라 움직인다.
 */
class PlacementRemixPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PlacementService placementService;

	@Autowired
	private PlacementRepository placements;

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

	private Long authorId;
	private Long remixerId;
	private Long deskTextureId;
	private Long armProductId;
	private Long monitorProductId;

	@BeforeEach
	void setUp() {
		authorId = users.save(User.create("author@example.com", Provider.KAKAO, "p-a", "원작자"))
				.getId();
		remixerId = users.save(User.create("remixer@example.com", Provider.KAKAO, "p-r", "리믹서"))
				.getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		deskTextureId = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1)).getId();
		armProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"모니터암", null, 89_000, null, 120, 480, 500, 4_000, false, MountSurface.TOP)).getId();
		monitorProductId = products.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"27인치 모니터", null, 350_000, null, 610, 200, 400, 5_500, false, MountSurface.TOP))
				.getId();
	}

	@Test
	@DisplayName("복사본의 결합은 복사본 아이템끼리 이어진다 — 원본 아이템 id를 가리키지 않는다")
	void 결합_재매핑() {
		Long sourceId = publishedSource();
		Long sourceArmId = itemIdOf(sourceId, armProductId);
		Long sourceMonitorId = itemIdOf(sourceId, monitorProductId);

		PlacementDetailResponse remixed = placementService.remix(remixerId, sourceId);
		flushAndClear();

		Placement copy = entityManager.find(Placement.class, remixed.id());
		PlacedItem copiedArm = itemOf(copy, armProductId);
		PlacedItem copiedMonitor = itemOf(copy, monitorProductId);

		assertThat(copiedArm.getId()).isNotIn(sourceArmId, sourceMonitorId);
		assertThat(copiedMonitor.isVesaMounted()).isTrue();
		assertThat(copiedMonitor.getMountedToPlacedItem().getId())
				.as("복사본의 모니터가 원본 암에 물려 있으면 두 배치가 한 그래프로 엮인다")
				.isEqualTo(copiedArm.getId())
				.isNotEqualTo(sourceArmId);

		// 원본 쪽은 그대로여야 한다 — 복사가 원본의 결합을 훔쳐 가지 않는다.
		Placement source = entityManager.find(Placement.class, sourceId);
		assertThat(itemOf(source, monitorProductId).getMountedToPlacedItem().getId())
				.isEqualTo(sourceArmId);
	}

	@Test
	@DisplayName("복사본은 아이템·책상·벽 3면·조명·예산을 그대로 갖고 호출자 소유 비공개다")
	void 전체_복사() {
		Long sourceId = publishedSource();

		PlacementDetailResponse remixed = placementService.remix(remixerId, sourceId);
		flushAndClear();

		Placement copy = entityManager.find(Placement.class, remixed.id());
		assertThat(copy.getUser().getId()).isEqualTo(remixerId);
		assertThat(copy.getPublishStatus()).isEqualTo(PublishStatus.PRIVATE);
		assertThat(copy.getSourcePlacement().getId()).isEqualTo(sourceId);
		assertThat(copy.getItems()).hasSize(2);
		assertThat(copy.isRoomLightOn()).isFalse();
		// 벽면 마감·표시 여부·바닥·시간대가 방 룩이다(ADR-0030) — 안 물려주면 복사본이 다른 방이다.
		assertThat(copy.getWalls()).hasSize(3).allSatisfy(wall -> {
			assertThat(wall.getMaterial()).isEqualTo("BRICK");
			assertThat(wall.getVariant()).isEqualTo("WARM_GRAY");
		});
		assertThat(copy.getWalls().stream()
				.filter(wall -> wall.getWallSide() == WallSide.FRONT)
				.findFirst().orElseThrow().isOn()).isFalse();
		assertThat(copy.getFloorMaterial()).isEqualTo("WOOD");
		assertThat(copy.getFloorVariant()).isEqualTo("OAK");
		assertThat(copy.getTimeOfDay()).isEqualTo(TimeOfDay.DAY);
		assertThat(copy.getBudgetKrw()).isEqualTo(1_000_000);
		assertThat(copy.getLikeCount()).as("남의 반응은 물려받지 않는다").isZero();

		PlacementDesk desk = copy.getDesk();
		assertThat(desk).isNotNull();
		assertThat(desk.getWidthMm()).isEqualTo(1400);
		assertThat(desk.getDepthMm()).isEqualTo(700);
		assertThat(desk.getHeightMm()).isEqualTo(720);
		assertThat(desk.getTopThicknessMm()).isEqualTo(25);
		assertThat(desk.getFrameType()).isEqualTo(FrameType.T_FRAME);
		assertThat(desk.getDeskTexture().getId()).isEqualTo(deskTextureId);
		assertThat(desk.getId()).isNotEqualTo(
				entityManager.find(Placement.class, sourceId).getDesk().getId());
	}

	@Test
	@DisplayName("원본의 스크린샷은 복사되지 않는다 — 새 배치는 아직 업로드 전이다")
	void 스크린샷_미복사() {
		Long sourceId = publishedSource();
		// 영속 배치의 썸네일은 벌크 UPDATE로 넣는다 — 엔티티 메서드는 @Version을 올린다.
		placements.updateThumbnailKey(sourceId, "placement-thumbnails/" + sourceId + ".png");
		flushAndClear();

		PlacementDetailResponse remixed = placementService.remix(remixerId, sourceId);
		flushAndClear();

		assertThat(entityManager.find(Placement.class, remixed.id()).getThumbnailKey()).isNull();
	}

	@Test
	@DisplayName("원본을 지워도 리믹스는 살아남고 출처는 '원본 없음'이 된다")
	void 원본_삭제_후_생존() {
		Long sourceId = publishedSource();
		Long remixId = placementService.remix(remixerId, sourceId).id();
		flushAndClear();

		placementService.delete(authorId, sourceId);
		flushAndClear();

		Placement survivor = entityManager.find(Placement.class, remixId);
		assertThat(survivor).isNotNull();
		assertThat(survivor.isDeleted()).isFalse();
		assertThat(survivor.getItems()).hasSize(2);

		PlacementDetailResponse detail = placementService.get(remixId, remixerId);
		assertThat(detail.sourcePlacement().available()).isFalse();
		assertThat(detail.sourcePlacement().id()).isEqualTo(sourceId);
		assertThat(detail.sourcePlacement().title()).isNull();
	}

	@Test
	@DisplayName("원본이 비공개면 404다 — 내 비공개 배치도 리믹스 대상이 아니다")
	void 비공개는_404() {
		Long privateId = savedSource();
		flushAndClear();

		assertThatThrownBy(() -> placementService.remix(remixerId, privateId))
				.isInstanceOf(BusinessException.class)
				.hasFieldOrPropertyWithValue("errorCode", PlacementErrorCode.PLACEMENT_NOT_FOUND);
		assertThatThrownBy(() -> placementService.remix(authorId, privateId))
				.isInstanceOf(BusinessException.class)
				.hasFieldOrPropertyWithValue("errorCode", PlacementErrorCode.PLACEMENT_NOT_FOUND);
	}

	@Test
	@DisplayName("리믹스를 다시 리믹스하면 출처는 직전 배치다 — 원본까지 거슬러 올라가지 않는다")
	void 리믹스의_리믹스() {
		Long sourceId = publishedSource();
		Long firstRemixId = placementService.remix(remixerId, sourceId).id();
		flushAndClear();

		placements.findByIdAndDeletedAtIsNull(firstRemixId).orElseThrow().markPublished();
		flushAndClear();

		Long secondRemixId = placementService.remix(authorId, firstRemixId).id();
		flushAndClear();

		assertThat(entityManager.find(Placement.class, secondRemixId).getSourcePlacement().getId())
				.isEqualTo(firstRemixId);
	}

	/** 원본 배치 — 암(p1) + 그 암에 물린 모니터(p2), 벽·조명·예산이 기본값과 다르게 심긴다. */
	private Long savedSource() {
		PlacementSaveResponse created = placementService.create(authorId,
				new PlacementSnapshotRequest("원본 배치", "설명", null, false,
						List.of(wall(WallSide.LEFT, true), wall(WallSide.FRONT, false),
								wall(WallSide.RIGHT, true)),
						null, null, 1_000_000,
						new DeskSnapshot(SpecSource.CUSTOM, null, 1400, 700, 720, 25, null,
								deskTextureId, FrameType.T_FRAME),
						List.of(item("p1", armProductId, null), item("p2", monitorProductId, "p1"))));
		return created.id();
	}

	private Long publishedSource() {
		Long sourceId = savedSource();
		placements.findByIdAndDeletedAtIsNull(sourceId).orElseThrow().markPublished();
		flushAndClear();
		return sourceId;
	}

	private Long itemIdOf(Long placementId, Long productId) {
		return itemOf(entityManager.find(Placement.class, placementId), productId).getId();
	}

	private PlacedItem itemOf(Placement placement, Long productId) {
		return placement.getItems().stream()
				.filter(item -> item.getProduct().getId().equals(productId))
				.findFirst()
				.orElseThrow(() -> new AssertionError("제품 %d 아이템이 없다".formatted(productId)));
	}

	/** 벽면 마감은 원본과 다르게 준다 — 복사가 기본값으로 떨어지면 이 값이 안 따라온다. */
	private WallSnapshot wall(WallSide side, boolean isOn) {
		return new WallSnapshot(side, isOn, 1200, "BRICK", "WARM_GRAY", false, null, null, null,
				null);
	}

	private ItemSnapshot item(String ref, Long productId, String mountedToRef) {
		return new ItemSnapshot(ref, null, productId, -200, 720, -150, BigDecimal.ZERO,
				BigDecimal.ZERO, MountSurface.TOP, null, mountedToRef, Map.of(), null);
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
