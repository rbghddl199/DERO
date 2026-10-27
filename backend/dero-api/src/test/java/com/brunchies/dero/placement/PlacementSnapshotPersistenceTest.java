package com.brunchies.dero.placement;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.placement.dto.DeskSnapshot;
import com.brunchies.dero.placement.dto.ItemRefMapping;
import com.brunchies.dero.placement.dto.ItemSnapshot;
import com.brunchies.dero.placement.dto.PlacementSaveResponse;
import com.brunchies.dero.placement.dto.PlacementSnapshotRequest;
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
 * 스냅샷 병합의 <b>SQL 수준 결과</b>를 못 박는다 — ADR-0009 결정 2가 통째 교체를 버리고 id 매칭 병합을
 * 고른 이유가 정확히 "{@code placed_item.id}가 저장마다 바뀌면 아이템 단위 외부 참조를 붙일 수 없다"이고,
 * 그 성질은 HTTP 응답만 봐서는 판정할 수 없다(응답에는 id가 실리지만 그게 <b>같은 행</b>인지는 안 보인다).
 *
 * <p>{@code created_at}까지 함께 보는 이유: 행이 지워지고 다시 들어갔으면 id가 우연히 같아도 감사 시각이
 * 리셋된다. 두 값을 같이 봐야 "제자리에서 UPDATE됐다"가 증명된다.
 */
class PlacementSnapshotPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PlacementService placementService;

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
	private Long deskTextureId;
	private Long armProductId;
	private Long monitorProductId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("merge@example.com", Provider.KAKAO, "p-merge", "병합"))
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
	@DisplayName("id가 실린 아이템은 같은 행으로 병합된다 — 저장 후에도 placed_item.id가 유지된다")
	void 아이템_id_유지() {
		PlacementSaveResponse created = placementService.create(ownerId,
				snapshot(null, List.of(item("p1", null, armProductId, null))));
		Long placementId = created.id();
		Long firstItemId = created.items().getFirst().id();
		flushAndClear();

		var beforeCreatedAt = loadItem(placementId, firstItemId).getCreatedAt();

		// 좌표만 바꿔 같은 id로 다시 저장한다.
		assertThat(loadItem(placementId, firstItemId).getPitchDeg())
				.as("pitchDeg를 안 보낸 저장은 DDL 기본값과 같은 0이다 — 이 필드를 아직 안 보내는 클라이언트도 저장된다")
				.isEqualByComparingTo("0.00");

		ItemSnapshot moved = new ItemSnapshot("p1", firstItemId, armProductId, 500, 720, -100,
				new BigDecimal("15.00"), new BigDecimal("-12.50"), MountSurface.TOP, null, null, null,
				null);
		PlacementSaveResponse updated =
				placementService.update(ownerId, placementId, snapshot(0L, List.of(moved)));
		flushAndClear();

		assertThat(updated.items()).extracting(ItemRefMapping::id).containsExactly(firstItemId);

		PlacedItem reloaded = loadItem(placementId, firstItemId);
		assertThat(reloaded.getPositionXMm()).isEqualTo(500);
		assertThat(reloaded.getRotationDeg()).isEqualByComparingTo("15.00");
		assertThat(reloaded.getPitchDeg()).isEqualByComparingTo("-12.50");
		assertThat(reloaded.getCreatedAt())
				.as("행이 지워지고 다시 들어갔으면 감사 시각이 리셋된다")
				.isEqualTo(beforeCreatedAt);
	}

	@Test
	@DisplayName("요청에 안 온 id는 지워지고 새 ref는 새 행이 된다 — 남은 아이템의 id는 그대로다")
	void 안_온_id는_삭제된다() {
		PlacementSaveResponse created = placementService.create(ownerId, snapshot(null, List.of(
				item("p1", null, armProductId, null),
				item("p2", null, monitorProductId, null))));
		Long placementId = created.id();
		Long keptId = created.items().getFirst().id();
		Long droppedId = created.items().get(1).id();
		flushAndClear();

		PlacementSaveResponse updated = placementService.update(ownerId, placementId, snapshot(0L,
				List.of(item("p1", keptId, armProductId, null),
						item("p3", null, monitorProductId, null))));
		flushAndClear();

		Placement reloaded = entityManager.find(Placement.class, placementId);
		assertThat(reloaded.getItems()).extracting(PlacedItem::getId)
				.contains(keptId)
				.doesNotContain(droppedId)
				.hasSize(2);
		assertThat(updated.items()).extracting(ItemRefMapping::ref).containsExactly("p1", "p3");
	}

	@Test
	@DisplayName("아이템만 바뀌고 배치 행이 그대로여도 version이 오른다 — 안 오르면 덮어쓰기를 못 잡는다")
	void 아이템만_바뀌어도_버전이_오른다() {
		PlacementSaveResponse created = placementService.create(ownerId,
				snapshot(null, List.of(item("p1", null, armProductId, null))));
		Long placementId = created.id();
		Long itemId = created.items().getFirst().id();
		flushAndClear();

		// 배치 속성(제목·벽·조명·예산)은 한 글자도 안 바꾸고 아이템 좌표만 옮긴다.
		ItemSnapshot moved = new ItemSnapshot("p1", itemId, armProductId, 900, 720, -100,
				BigDecimal.ZERO, BigDecimal.ZERO, MountSurface.TOP, null, null, Map.of(), null);
		PlacementSaveResponse updated = placementService.update(ownerId, placementId,
				snapshot(created.version(), List.of(moved)));
		flushAndClear();

		assertThat(updated.version())
				.as("응답 version이 커밋된 값과 같아야 다음 저장이 409로 튕기지 않는다")
				.isEqualTo(entityManager.find(Placement.class, placementId).getVersion());
		assertThat(updated.version()).isGreaterThan(created.version());
	}

	@Test
	@DisplayName("물린 암을 지우면 결합이 먼저 끊겨 자기참조 FK 위반이 나지 않는다")
	void 결합_대상_삭제() {
		PlacementSaveResponse created = placementService.create(ownerId, snapshot(null, List.of(
				item("p1", null, armProductId, null),
				item("p2", null, monitorProductId, "p1"))));
		Long placementId = created.id();
		Long monitorId = created.items().get(1).id();
		flushAndClear();

		// 암(p1)만 빼고 모니터는 남긴다 — 모니터의 mounted_to_placed_item_id UPDATE가 암 DELETE보다
		// 먼저 나가지 않으면 fk_placed_item_mounted_to_placed_item_id(NO ACTION)가 터진다.
		placementService.update(ownerId, placementId,
				snapshot(0L, List.of(item("p2", monitorId, monitorProductId, null))));
		flushAndClear();

		PlacedItem monitor = loadItem(placementId, monitorId);
		assertThat(monitor.isVesaMounted()).isFalse();
		assertThat(monitor.getMountedToPlacedItem()).isNull();
	}

	@Test
	@DisplayName("신규 아이템이 신규 아이템에 물려도 결합 대상이 먼저 INSERT된다")
	void 신규끼리_결합() {
		PlacementSaveResponse created = placementService.create(ownerId, snapshot(null, List.of(
				// 물리는 쪽(p2)이 요청에서 먼저 온다 — 서버가 정렬해야 FK 위반이 안 난다.
				item("p2", null, monitorProductId, "p1"),
				item("p1", null, armProductId, null))));
		flushAndClear();

		Long monitorId = created.items().stream()
				.filter(mapping -> mapping.ref().equals("p2"))
				.findFirst().orElseThrow().id();
		Long armId = created.items().stream()
				.filter(mapping -> mapping.ref().equals("p1"))
				.findFirst().orElseThrow().id();

		PlacedItem monitor = loadItem(created.id(), monitorId);
		assertThat(monitor.getMountedToPlacedItem().getId()).isEqualTo(armId);
	}

	/**
	 * {@code findForUpdateById}를 검증용 조회에 쓰지 않는다 — {@code OPTIMISTIC_FORCE_INCREMENT}가
	 * 걸려 있어 <b>읽기만 해도 다음 flush에서 version이 올라간다</b>. 그러면 뒤따르는 저장의 버전 비교가
	 * 테스트 코드 때문에 어긋난다.
	 */
	private PlacedItem loadItem(Long placementId, Long itemId) {
		return entityManager.find(Placement.class, placementId).getItems().stream()
				.filter(item -> item.getId().equals(itemId))
				.findFirst()
				.orElseThrow(() -> new AssertionError("아이템 %d가 없다".formatted(itemId)));
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}

	private PlacementSnapshotRequest snapshot(Long version, List<ItemSnapshot> items) {
		return new PlacementSnapshotRequest("병합 테스트", null, version, true, null, null, null,
				1_000_000,
				new DeskSnapshot(SpecSource.CUSTOM, null, 1400, 700, 720, 25, null,
						deskTextureId, FrameType.T_FRAME),
				items);
	}

	private ItemSnapshot item(String ref, Long id, Long productId, String mountedToRef) {
		// pitchDeg는 일부러 null이다 — 이 필드를 안 보내는 클라이언트의 저장 경로를 그대로 태운다.
		return new ItemSnapshot(ref, id, productId, -200, 720, -150, BigDecimal.ZERO, null,
				MountSurface.TOP, null, mountedToRef, Map.of(), null);
	}
}
