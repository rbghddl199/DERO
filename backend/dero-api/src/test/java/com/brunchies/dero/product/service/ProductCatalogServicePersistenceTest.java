package com.brunchies.dero.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Distribution;
import com.brunchies.dero.product.EmitterShape;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.PanelShape;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@code GET /products}의 커서 페이지네이션(5종 규격 공통, DERO-325)과
 * {@code GET /products/{id}} 상세를 실제 Postgres로 검증한다.
 *
 * <p><b>상세 픽스처는 {@link Desk}로 만들지 않는다</b> — {@code setUp}이 만든 책상 5개가 목록 테스트의
 * 기대값(총 5건)이라, 여기서 책상을 하나 더 만들면 그쪽이 조용히 깨진다.
 */
class ProductCatalogServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private ProductCatalogService productCatalogService;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private BrandRepository brandRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private DeskTextureRepository deskTextureRepository;

	@Autowired
	private VesaSpecRepository vesaSpecRepository;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private EntityManager entityManager;

	private Category category;
	private Brand brand;
	private User owner;
	private DeskTexture deskTexture;

	@BeforeEach
	void setUp() {
		category = categoryRepository.save(Category.createRoot("책상", null, 1));
		brand = brandRepository.save(Brand.create("데스커", null, null, null));
		owner = userRepository.save(
				User.create("owner@example.com", Provider.KAKAO, "kakao-1", "업로더"));
		deskTexture = deskTextureRepository.save(DeskTexture.create("오크", "#C9A876", null, null,
				null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));

		for (int i = 1; i <= 5; i++) {
			productRepository.save(Desk.create(ProductSource.CATALOG, null, null, category, "책상 " + i,
					null, 100_000 * i, null, 1200 + i, 600, 720, 25, 25, false, deskTexture,
					FrameType.T_FRAME, null));
		}
	}

	@Test
	@DisplayName("size보다 많으면 hasNext=true이고 nextCursor로 다음 페이지를 이어 받는다")
	void 커서_페이지네이션() {
		CursorPage<ProductDetailResponse> firstPage =
				productCatalogService.list(SpecType.DESK, null, null, null, 2);
		assertThat(firstPage.content()).hasSize(2);
		assertThat(firstPage.hasNext()).isTrue();
		assertThat(firstPage.nextCursor()).isNotNull();

		CursorPage<ProductDetailResponse> secondPage =
				productCatalogService.list(SpecType.DESK, null, null, firstPage.nextCursor(), 2);
		assertThat(secondPage.content()).hasSize(2);
		assertThat(secondPage.hasNext()).isTrue();

		CursorPage<ProductDetailResponse> thirdPage =
				productCatalogService.list(SpecType.DESK, null, null, secondPage.nextCursor(), 2);
		assertThat(thirdPage.content()).hasSize(1);
		assertThat(thirdPage.hasNext()).isFalse();
		assertThat(thirdPage.nextCursor()).isNull();

		// 세 페이지를 합치면 중복·누락 없이 등록순 그대로다.
		assertThat(firstPage.content().get(0).id()).isLessThan(firstPage.content().get(1).id());
		assertThat(firstPage.content().get(1).id()).isLessThan(secondPage.content().get(0).id());
		assertThat(secondPage.content().get(1).id()).isLessThan(thirdPage.content().get(0).id());

		// totalCount는 첫 페이지(cursor=null)에서만 계산한다(M3) — 이후 페이지는 프론트가 이미
		// 받은 값을 들고 있으므로 재계산하지 않고 0을 내려준다.
		assertThat(firstPage.totalCount()).isEqualTo(5);
		assertThat(secondPage.totalCount()).isZero();
		assertThat(thirdPage.totalCount()).isZero();
	}

	@Test
	@DisplayName("size 이하로 존재하면 hasNext=false이고 nextCursor는 없다")
	void 마지막_페이지() {
		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.DESK, null, null, null, 20);
		assertThat(page.content()).hasSize(5);
		assertThat(page.hasNext()).isFalse();
		assertThat(page.nextCursor()).isNull();
		assertThat(page.totalCount()).isEqualTo(5);
	}

	@Test
	@DisplayName("specType을 생략하면 규격 5종이 섞여 id 오름차순 한 페이지로 나온다")
	void 전체_조회_규격_생략시_혼합_반환() {
		Long monitorId = 승인된_모니터(category, "27인치 모니터", 500_000);
		Long propId = 승인된_소품();

		CursorPage<ProductDetailResponse> page = productCatalogService.list(null, null, null, null, 20);

		assertThat(page.totalCount()).isEqualTo(7);
		assertThat(page.content()).hasSize(7);
		assertThat(page.content()).extracting(ProductDetailResponse::id)
				.isSorted()
				.doesNotHaveDuplicates();
		assertThat(page.content().get(5).id()).isEqualTo(monitorId);
		assertThat(page.content().get(5).specType()).isEqualTo(SpecType.MONITOR);
		assertThat(page.content().get(6).id()).isEqualTo(propId);
		assertThat(page.content().get(6).specType()).isEqualTo(SpecType.PROP);
	}

	@Test
	@DisplayName("specType=MONITOR면 모니터만 반환하고 책상·소품은 섞이지 않는다")
	void specType_필터링_MONITOR만_반환() {
		Long monitorId = 승인된_모니터(category, "27인치 모니터", 500_000);
		승인된_소품();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, null, null, null, 20);

		assertThat(page.totalCount()).isEqualTo(1);
		assertThat(page.content()).hasSize(1);
		assertThat(page.content().get(0).id()).isEqualTo(monitorId);
		assertThat(page.content().get(0).specType()).isEqualTo(SpecType.MONITOR);
	}

	@Test
	@DisplayName("categoryId로 좁히면 그 카테고리에 속한 제품만 반환하고 totalCount도 그만큼 줄어든다")
	void categoryId_필터로_좁힌다() {
		Category monitorCategory = categoryRepository.save(Category.createRoot("모니터", null, 2));
		Long monitorId = 승인된_모니터(monitorCategory, "27인치 모니터", 500_000);

		CursorPage<ProductDetailResponse> monitorCategoryPage =
				productCatalogService.list(null, List.of(monitorCategory.getId()), null, null, 20);
		assertThat(monitorCategoryPage.totalCount()).isEqualTo(1);
		assertThat(monitorCategoryPage.content()).extracting(ProductDetailResponse::id)
				.containsExactly(monitorId);

		CursorPage<ProductDetailResponse> deskCategoryPage =
				productCatalogService.list(null, List.of(category.getId()), null, null, 20);
		assertThat(deskCategoryPage.totalCount()).isEqualTo(5);
	}

	@Test
	@DisplayName("specType과 categoryId를 동시에 걸면 두 조건을 다 만족하는 제품만 남는다(M2 회귀)")
	void specType_categoryId_동시_필터() {
		승인된_모니터(category, "책상 카테고리의 모니터", 500_000);
		// setUp의 책상 5개와 같은 category를 쓰므로, MONITOR + 이 category로 좁히면 방금 만든 1건뿐이다.

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, List.of(category.getId()), null, null, 20);

		assertThat(page.totalCount()).isEqualTo(1);
		assertThat(page.content()).extracting(ProductDetailResponse::specType)
				.containsOnly(SpecType.MONITOR);
	}

	@Test
	@DisplayName("cursor와 categoryId를 같이 걸어도 그 카테고리 안에서만 페이지가 이어진다")
	void cursor_categoryId_조합() {
		Category monitorCategory = categoryRepository.save(Category.createRoot("모니터", null, 2));
		Long m1 = 승인된_모니터(monitorCategory, "모니터 1", 500_000);
		Long m2 = 승인된_모니터(monitorCategory, "모니터 2", 500_000);
		승인된_모니터(monitorCategory, "모니터 3", 500_000);

		CursorPage<ProductDetailResponse> firstPage =
				productCatalogService.list(null, List.of(monitorCategory.getId()), null, null, 2);
		assertThat(firstPage.content()).extracting(ProductDetailResponse::id).containsExactly(m1, m2);
		assertThat(firstPage.hasNext()).isTrue();

		CursorPage<ProductDetailResponse> secondPage = productCatalogService.list(
				null, List.of(monitorCategory.getId()), null, firstPage.nextCursor(), 2);
		assertThat(secondPage.content()).hasSize(1);
		assertThat(secondPage.hasNext()).isFalse();
		// 다른 카테고리(setUp의 책상 5개)는 categoryId 필터에 걸려 절대 섞이지 않는다.
		assertThat(secondPage.content()).extracting(ProductDetailResponse::specType)
				.containsOnly(SpecType.MONITOR);
	}

	@Test
	@DisplayName("존재하지 않는 categoryId로 필터링하면 빈 페이지다")
	void categoryId_존재하지_않으면_빈_페이지() {
		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(null, List.of(999_999L), null, null, 20);

		assertThat(page.content()).isEmpty();
		assertThat(page.totalCount()).isZero();
		assertThat(page.hasNext()).isFalse();
	}

	@Test
	@DisplayName("HIDDEN 제품은 목록에서 빠진다 — 카탈로그 노출 축은 status다")
	void HIDDEN_제품은_목록에서_제외() {
		Long hiddenId = 승인된_모니터(category, "숨긴 모니터", 500_000);
		Product hidden = productRepository.findById(hiddenId).orElseThrow();
		hidden.hide();
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, null, null, null, 20);

		assertThat(page.content()).extracting(ProductDetailResponse::id).doesNotContain(hiddenId);
		assertThat(page.totalCount()).isZero();
	}

	@Test
	@DisplayName("대표 이미지가 없는 제품은 목록 항목의 images가 빈 배열이다")
	void 목록_대표이미지_없으면_빈_배열() {
		승인된_모니터(category, "이미지 없는 모니터", 500_000);

		ProductDetailResponse item = productCatalogService
				.list(SpecType.MONITOR, null, null, null, 20).content().get(0);

		assertThat(item.images()).isEmpty();
	}

	@Test
	@DisplayName("USER 소스 Desk는 카탈로그 예외를 안 받는다 — 검수 미통과면 목록에서 빠진다(M5 회귀)")
	void USER_소스_Desk는_검수_없으면_제외() {
		Product userDesk = productRepository.save(Desk.create(ProductSource.USER, owner, null,
				category, "자작 책상", null, null, null, 1400, 700, 720, 25, 30, false, deskTexture,
				FrameType.T_FRAME, null));
		userDesk.attachAsset(Asset.create(userDesk, "assets/user-desk.glb", GlbExportMode.TEXTURE,
				null, 20_000, null));
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.DESK, null, null, null, 20);

		// setUp의 CATALOG Desk 5개만 남는다 — USER Desk는 검수(PENDING)라 빠진다.
		assertThat(page.content()).extracting(ProductDetailResponse::id)
				.doesNotContain(userDesk.getId());
		assertThat(page.totalCount()).isEqualTo(5);
	}

	@Test
	@DisplayName("자식 카테고리의 제품도 부모(루트) categoryId로 필터링하면 롤업되어 잡힌다(M6 회귀)")
	void 자식_카테고리_제품이_부모_categoryId로_롤업() {
		Category root = categoryRepository.save(Category.createRoot("모니터", null, 3));
		Category child = categoryRepository.save(Category.createChild(root, "27인치", null, 1));
		Long childProductId = 승인된_모니터(child, "27인치 모니터", 500_000);

		CursorPage<ProductDetailResponse> byRoot =
				productCatalogService.list(null, List.of(root.getId()), null, null, 20);
		assertThat(byRoot.content()).extracting(ProductDetailResponse::id).containsExactly(childProductId);
		assertThat(byRoot.totalCount()).isEqualTo(1);

		CursorPage<ProductDetailResponse> byChild =
				productCatalogService.list(null, List.of(child.getId()), null, null, 20);
		assertThat(byChild.content()).extracting(ProductDetailResponse::id).containsExactly(childProductId);
	}

	@Test
	@DisplayName("3단 트리에서도 대분류 categoryId 하나로 중·소분류 제품이 전부 롤업된다(2026-08-04 회귀)")
	void 손자_카테고리_제품도_대분류_categoryId로_롤업() {
		Category root = categoryRepository.save(Category.createRoot("소품", null, 3));
		Category mid = categoryRepository.save(Category.createChild(root, "주변기기", null, 1));
		Category leaf = categoryRepository.save(Category.createChild(mid, "키보드", null, 1));
		Long rootProductId = 승인된_모니터(root, "대분류 직속 제품", 100_000);
		Long midProductId = 승인된_모니터(mid, "중분류 제품", 200_000);
		Long leafProductId = 승인된_모니터(leaf, "소분류 제품", 300_000);

		// 부모 1단만 보던 옛 술어는 여기서 leafProductId를 빠뜨렸다 — 실 데이터에서 소품(5)이
		// 소분류 40여 건을 통째로 잃은 것과 같은 원인이다.
		CursorPage<ProductDetailResponse> byRoot =
				productCatalogService.list(null, List.of(root.getId()), null, null, 20);
		assertThat(byRoot.content()).extracting(ProductDetailResponse::id)
				.containsExactlyInAnyOrder(rootProductId, midProductId, leafProductId);
		assertThat(byRoot.totalCount()).isEqualTo(3);

		CursorPage<ProductDetailResponse> byMid =
				productCatalogService.list(null, List.of(mid.getId()), null, null, 20);
		assertThat(byMid.content()).extracting(ProductDetailResponse::id)
				.containsExactlyInAnyOrder(midProductId, leafProductId);
	}

	@Test
	@DisplayName("categoryId 여러 개를 주면 각자의 하위 트리를 롤업한 합집합이 나온다 — 시뮬레이터 '전체' 타일 경로")
	void 복수_categoryId는_하위트리_합집합() {
		Category monitorRoot = categoryRepository.save(Category.createRoot("모니터 • 모니터암", null, 3));
		Category monitorChild = categoryRepository.save(
				Category.createChild(monitorRoot, "모니터", null, 1));
		Category soundRoot = categoryRepository.save(Category.createRoot("음향", null, 4));
		Category deskRoot = categoryRepository.save(Category.createRoot("책상", null, 5));
		Long monitorChildProductId = 승인된_모니터(monitorChild, "27인치 모니터", 500_000);
		Long soundProductId = 승인된_모니터(soundRoot, "북셸프 스피커", 129_000);
		Long deskProductId = 승인된_모니터(deskRoot, "책상 취급 제품", 200_000);

		CursorPage<ProductDetailResponse> page = productCatalogService.list(
				null, List.of(monitorRoot.getId(), soundRoot.getId()), null, null, 20);

		// 두 대분류의 하위 트리가 합쳐지고, 목록에 없는 대분류(책상)는 안 섞인다 — 파라미터를 생략한
		// "전체 조회"와 다른 점이 정확히 이것이다.
		assertThat(page.content()).extracting(ProductDetailResponse::id)
				.containsExactlyInAnyOrder(monitorChildProductId, soundProductId)
				.doesNotContain(deskProductId);
		assertThat(page.totalCount()).isEqualTo(2);
	}

	@Test
	@DisplayName("categoryId가 빈 목록이면 카테고리 필터가 없는 것과 같다")
	void 빈_categoryId는_필터_없음() {
		Category root = categoryRepository.save(Category.createRoot("모니터", null, 3));
		Long productId = 승인된_모니터(root, "27인치 모니터", 500_000);

		CursorPage<ProductDetailResponse> page = productCatalogService.list(null, List.of(), null, null, 20);

		assertThat(page.content()).extracting(ProductDetailResponse::id).contains(productId);
	}

	@Test
	@DisplayName("GLB 필수 3종은 에셋 행이 없으면 목록에서 제외된다")
	void GLB_필수_3종_에셋_없으면_제외() {
		Long propId = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.PROP, null, null, null, 20);

		assertThat(page.totalCount()).isZero();
		assertThat(page.content()).extracting(ProductDetailResponse::id).doesNotContain(propId);
	}

	@Test
	@DisplayName("GLB 필수 3종은 에셋이 검수 대기(PENDING)면 목록에서 제외된다")
	void GLB_필수_3종_에셋_검수대기면_제외() {
		Long propId = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		Product prop = productRepository.findById(propId).orElseThrow();
		prop.attachAsset(Asset.create(prop, "assets/pending.glb", GlbExportMode.TEXTURE, null,
				1_000, null));
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.PROP, null, null, null, 20);

		assertThat(page.content()).isEmpty();
	}

	@Test
	@DisplayName("GLB 필수 3종은 에셋이 반려(REJECTED)면 목록에서 제외된다")
	void GLB_필수_3종_에셋_반려면_제외() {
		Long propId = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		Product prop = productRepository.findById(propId).orElseThrow();
		Asset asset = Asset.create(prop, "assets/rejected.glb", GlbExportMode.TEXTURE, null, 1_000, null);
		prop.attachAsset(asset);
		asset.reject("폴리곤이 너무 많습니다.");
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.PROP, null, null, null, 20);

		assertThat(page.content()).isEmpty();
	}

	@Test
	@DisplayName("DESK는 에셋 행이 없어도 목록에 포함된다 — 검수 조건에서 제외되기 때문이다")
	void DESK는_에셋_없어도_목록에_포함() {
		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.DESK, null, null, null, 20);

		assertThat(page.content()).hasSize(5);
		assertThat(page.content()).allSatisfy(item -> {
			assertThat(item.specType()).isEqualTo(SpecType.DESK);
			assertThat(item.desk()).isNotNull();
			assertThat(item.asset()).isNull();
		});
	}

	@Test
	@DisplayName("CATALOG 모니터는 에셋 행이 없어도 목록에 포함된다 — D18 재개정으로 모니터도 절차 생성이다")
	void CATALOG_모니터는_에셋_없어도_목록에_포함() {
		Long monitorId = productRepository.save(모니터(category, "에셋 없는 모니터", 500_000)).getId();
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, null, null, null, 20);

		assertThat(page.totalCount()).isEqualTo(1);
		assertThat(page.content()).extracting(ProductDetailResponse::id).containsExactly(monitorId);
		assertThat(page.content().get(0).asset()).isNull();
	}

	@Test
	@DisplayName("USER 소스 모니터는 절차 생성 예외를 안 받는다 — 검수 미통과면 목록에서 빠진다")
	void USER_소스_모니터는_검수_없으면_제외() {
		Product userMonitor = productRepository.save(Monitor.create(ProductSource.USER, owner, brand,
				category, "자작 모니터", null, null, null, new BigDecimal("27.0"), 16, 9, 8, null,
				PanelShape.FLAT, null, 130, true, true, null, null, null, null, 5_000, null));
		userMonitor.attachAsset(Asset.create(userMonitor, "assets/user-monitor.glb",
				GlbExportMode.TEXTURE, null, 20_000, null));
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, null, null, null, 20);

		assertThat(page.content()).extracting(ProductDetailResponse::id)
				.doesNotContain(userMonitor.getId());
		assertThat(page.totalCount()).isZero();
	}

	@Test
	@DisplayName("승인된 비DESK 목록 항목엔 presigned 에셋 URL·발광·대표 이미지 1장·정렬된 VESA가 실린다")
	void 승인된_비DESK_제품_목록_항목_상세필드() {
		VesaSpec v100x100 = vesaSpecRepository.save(VesaSpec.create(100, 100));
		VesaSpec v75x75 = vesaSpecRepository.save(VesaSpec.create(75, 75));

		Long id = productRepository.save(모니터(category, "27인치 모니터", 500_000)).getId();
		Product product = productRepository.findById(id).orElseThrow();
		product.registerAsset("assets/" + id + ".glb", GlbExportMode.TEXTURE, null, 12_000, null);
		product.registerEmitter(EmitterShape.SPOT, Distribution.FLOOD, 800, 1_500, true, "#FFEEDD",
				10, 20, 30);
		// 대표가 아닌 이미지를 먼저 붙여 "대표만 뽑히는지"를 실제로 본다.
		product.addImage(ProductImage.create(product, "product-images/" + id + "/sub.png", 1, false));
		product.addImage(ProductImage.create(product, "product-images/" + id + "/primary.png", 0, true));
		product.replaceVesaSpecs(List.of(v100x100, v75x75));
		entityManager.flush();
		entityManager.clear();

		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(SpecType.MONITOR, null, null, null, 20);
		ProductDetailResponse item = page.content().get(0);

		assertThat(item.asset()).isNotNull();
		assertThat(item.asset().reviewStatus()).isEqualTo(ReviewStatus.APPROVED);
		assertThat(item.asset().assetUrl()).contains("assets/" + id + ".glb");
		// 목록엔 admin 경로가 없다 — assetKey는 항상 null이다(M4).
		assertThat(item.asset().assetKey()).isNull();

		assertThat(item.emitter()).isNotNull();
		assertThat(item.emitter().lumens()).isEqualTo(800);
		assertThat(item.emitter().defaultColor()).isEqualTo("#FFEEDD");

		assertThat(item.images()).hasSize(1);
		assertThat(item.images().get(0).isPrimary()).isTrue();
		assertThat(item.images().get(0).imageUrl()).contains("/primary.png");

		assertThat(item.vesaSpecs())
				.extracting(VesaSpecResponse::widthMm, VesaSpecResponse::heightMm)
				.containsExactly(tuple(75, 75), tuple(100, 100));
	}

	@Test
	@DisplayName("혼합 규격에서도 커서 페이지네이션이 id 오름차순 경계를 지키고 totalCount는 필터 전체를 가리킨다")
	void 커서_페이지네이션_혼합_규격() {
		승인된_모니터(category, "모니터 1", 500_000);
		Long monitorId2 = 승인된_모니터(category, "모니터 2", 500_000);
		// 책상 5(setUp) + 모니터 2 = 총 7건.

		CursorPage<ProductDetailResponse> firstPage = productCatalogService.list(null, null, null, null, 3);
		assertThat(firstPage.content()).hasSize(3);
		assertThat(firstPage.hasNext()).isTrue();
		assertThat(firstPage.totalCount()).isEqualTo(7);

		CursorPage<ProductDetailResponse> secondPage =
				productCatalogService.list(null, null, null, firstPage.nextCursor(), 3);
		assertThat(secondPage.content()).hasSize(3);
		assertThat(secondPage.hasNext()).isTrue();
		// 첫 페이지가 아니라 재계산하지 않는다(M3).
		assertThat(secondPage.totalCount()).isZero();

		CursorPage<ProductDetailResponse> thirdPage =
				productCatalogService.list(null, null, null, secondPage.nextCursor(), 3);
		assertThat(thirdPage.content()).hasSize(1);
		assertThat(thirdPage.hasNext()).isFalse();
		assertThat(thirdPage.nextCursor()).isNull();
		assertThat(thirdPage.content().get(0).id()).isEqualTo(monitorId2);
		assertThat(thirdPage.totalCount()).isZero();

		List<Long> allIds = new ArrayList<>();
		allIds.addAll(firstPage.content().stream().map(ProductDetailResponse::id).toList());
		allIds.addAll(secondPage.content().stream().map(ProductDetailResponse::id).toList());
		allIds.addAll(thirdPage.content().stream().map(ProductDetailResponse::id).toList());

		assertThat(allIds).hasSize(7).doesNotHaveDuplicates();
		assertThat(allIds).isSorted();
	}

	// --- 단건 상세 ---

	@Test
	@DisplayName("상세는 규격·에셋·발광·이미지를 한 응답에 담고 키가 아니라 presigned URL을 내려준다")
	void 상세_정상() {
		Long id = productRepository.save(Monitor.create(ProductSource.CATALOG, null, brand, category,
				"U2723QE", "27인치", 700_000, "https://example.com/u2723qe",
				new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130, true, true,
				null, null, null, null, 5_000, List.of("HDMI 2.0", "DP 1.4"))).getId();

		Product product = productRepository.findById(id).orElseThrow();
		product.registerAsset("assets/" + id + ".glb", GlbExportMode.TEXTURE, null, 12_000, null);
		product.registerEmitter(EmitterShape.SPOT, Distribution.FLOOD, 800, 1_500, true, "#FFEEDD",
				10, 20, 30);
		// displayOrder를 역순으로 넣어 정렬이 실제로 도는지 본다.
		product.addImage(ProductImage.create(product, "product-images/" + id + "/b.png", 1, false));
		product.addImage(ProductImage.create(product, "product-images/" + id + "/a.png", 0, true));
		entityManager.flush();
		entityManager.clear();

		ProductDetailResponse detail = productCatalogService.getDetail(id, null, false);

		assertThat(detail.id()).isEqualTo(id);
		assertThat(detail.specType()).isEqualTo(SpecType.MONITOR);
		assertThat(detail.source()).isEqualTo(ProductSource.CATALOG);
		assertThat(detail.status()).isEqualTo(ProductStatus.ACTIVE);
		assertThat(detail.brandId()).isEqualTo(brand.getId());
		assertThat(detail.brandName()).isEqualTo("데스커");
		assertThat(detail.categoryId()).isEqualTo(category.getId());
		assertThat(detail.categoryName()).isEqualTo("책상");

		// 규격은 specType이 가리키는 칸 하나만 채워진다.
		assertThat(detail.monitor()).isNotNull();
		assertThat(detail.monitor().diagonalInch()).isEqualByComparingTo("27.0");
		assertThat(detail.monitor().weightG()).isEqualTo(5_000);
		assertThat(detail.monitor().ports()).containsExactly("HDMI 2.0", "DP 1.4");
		assertThat(detail.desk()).isNull();
		assertThat(detail.arm()).isNull();
		assertThat(detail.light()).isNull();
		assertThat(detail.prop()).isNull();

		// 운영진 등록 에셋은 즉시 APPROVED다(api-spec §9).
		assertThat(detail.asset()).isNotNull();
		assertThat(detail.asset().reviewStatus()).isEqualTo(ReviewStatus.APPROVED);
		assertThat(detail.asset().polygonCount()).isEqualTo(12_000);
		assertThat(detail.asset().assetUrl()).contains("assets/" + id + ".glb");
		// 비관리자 호출이라 assetKey는 null이다(M4) — 관리자 노출은 별도 테스트가 본다.
		assertThat(detail.asset().assetKey()).isNull();

		assertThat(detail.emitter()).isNotNull();
		assertThat(detail.emitter().productId()).isEqualTo(id);
		assertThat(detail.emitter().lumens()).isEqualTo(800);
		assertThat(detail.emitter().defaultColor()).isEqualTo("#FFEEDD");

		assertThat(detail.images()).hasSize(2);
		assertThat(detail.images().get(0).displayOrder()).isZero();
		assertThat(detail.images().get(0).isPrimary()).isTrue();
		assertThat(detail.images().get(0).imageUrl()).contains("/a.png");
		assertThat(detail.images().get(1).imageUrl()).contains("/b.png");
	}

	@Test
	@DisplayName("관리자 호출은 assetKey를 그대로 받는다 — PUT /admin 왕복에 필요하다(M4)")
	void 상세_관리자는_assetKey_노출() {
		Long id = productRepository.save(Monitor.create(ProductSource.CATALOG, null, brand, category,
				"U2723QE", "27인치", 700_000, "https://example.com/u2723qe",
				new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130, true, true,
				null, null, null, null, 5_000, null)).getId();
		Product product = productRepository.findById(id).orElseThrow();
		product.registerAsset("assets/" + id + ".glb", GlbExportMode.TEXTURE, null, 12_000, null);
		entityManager.flush();
		entityManager.clear();

		ProductDetailResponse detail = productCatalogService.getDetail(id, 999L, true);

		assertThat(detail.asset().assetKey()).isEqualTo("assets/" + id + ".glb");
	}

	@Test
	@DisplayName("에셋·발광이 없는 제품은 그 두 필드가 null이고 이미지는 빈 배열이다")
	void 상세_에셋_없음() {
		Long id = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		entityManager.flush();
		entityManager.clear();

		ProductDetailResponse detail = productCatalogService.getDetail(id, null, false);

		assertThat(detail.specType()).isEqualTo(SpecType.PROP);
		assertThat(detail.prop().mountSurface()).isEqualTo(MountSurface.TOP);
		assertThat(detail.asset()).isNull();
		assertThat(detail.emitter()).isNull();
		assertThat(detail.images()).isEmpty();
	}

	@Test
	@DisplayName("상세의 vesaSpecs는 width·height 오름차순이고, 태깅 없는 제품은 빈 배열이다")
	void 상세_VESA_태깅() {
		VesaSpec v100x100 = vesaSpecRepository.save(VesaSpec.create(100, 100));
		VesaSpec v75x75 = vesaSpecRepository.save(VesaSpec.create(75, 75));
		VesaSpec v100x50 = vesaSpecRepository.save(VesaSpec.create(100, 50));

		Product monitor = productRepository.save(Monitor.create(ProductSource.CATALOG, null, brand,
				category, "U2723QE", null, 700_000, "https://example.com/u2723qe",
				new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130, true, true,
				null, null, null, null, 5_000, null));
		// 정렬 기대값과 어긋난 순서로 붙여 정렬이 실제로 도는지 본다.
		monitor.replaceVesaSpecs(List.of(v100x100, v75x75, v100x50));
		Long id = monitor.getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(productCatalogService.getDetail(id, null, false).vesaSpecs())
				.extracting(VesaSpecResponse::widthMm, VesaSpecResponse::heightMm)
				.containsExactly(tuple(75, 75), tuple(100, 50), tuple(100, 100));

		Long 태깅없음 = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(productCatalogService.getDetail(태깅없음, null, false).vesaSpecs()).isEmpty();
	}

	@Test
	@DisplayName("삭제된 제품은 404 PRODUCT_NOT_FOUND다")
	void 상세_삭제됨() {
		Product product = productRepository.save(소품(ProductSource.CATALOG, null));
		product.softDelete();
		entityManager.flush();
		entityManager.clear();

		assertNotFound(product.getId(), null, false);
	}

	@Test
	@DisplayName("검수 대기 중인 자작 제품은 익명에게 404다 — 존재 여부 자체가 정보라 403이 아니다")
	void 상세_자작_검수중_익명() {
		assertNotFound(검수대기_자작_제품(), null, false);
	}

	@Test
	@DisplayName("검수 대기 중인 자작 제품을 업로더 본인은 200으로 본다")
	void 상세_자작_검수중_본인() {
		Long id = 검수대기_자작_제품();

		ProductDetailResponse detail = productCatalogService.getDetail(id, owner.getId(), false);

		assertThat(detail.id()).isEqualTo(id);
		assertThat(detail.source()).isEqualTo(ProductSource.USER);
		assertThat(detail.asset().reviewStatus()).isEqualTo(ReviewStatus.PENDING);
	}

	@Test
	@DisplayName("검수 대기 중인 자작 제품을 ADMIN도 본다 — 검수자가 못 보면 검수가 성립하지 않는다")
	void 상세_자작_검수중_관리자() {
		Long id = 검수대기_자작_제품();

		assertThat(productCatalogService.getDetail(id, 999L, true).id()).isEqualTo(id);
	}

	@Test
	@DisplayName("반려된 자작 제품도 본인·ADMIN만 보고, 상세에 반려 사유가 실린다")
	void 상세_자작_반려() {
		Long id = 검수대기_자작_제품();
		Asset asset = productRepository.findById(id).orElseThrow().getAsset();
		asset.reject("폴리곤이 너무 많습니다.");
		entityManager.flush();
		entityManager.clear();

		assertNotFound(id, null, false);
		assertThat(productCatalogService.getDetail(id, owner.getId(), false).asset().reviewNote())
				.isEqualTo("폴리곤이 너무 많습니다.");
	}

	@Test
	@DisplayName("HIDDEN 제품은 ADMIN만 본다 — 익명은 404다")
	void 상세_숨김() {
		Product product = productRepository.save(소품(ProductSource.CATALOG, null));
		product.hide();
		Long id = product.getId();
		entityManager.flush();
		entityManager.clear();

		assertNotFound(id, null, false);
		assertThat(productCatalogService.getDetail(id, 999L, true).status())
				.isEqualTo(ProductStatus.HIDDEN);
	}

	@Test
	@DisplayName("HIDDEN이면 업로더 본인도 못 본다 — 내린 주체가 운영진이다")
	void 상세_숨김_본인도_404() {
		Product product = productRepository.save(소품(ProductSource.USER, owner));
		product.hide();
		Long id = product.getId();
		entityManager.flush();
		entityManager.clear();

		assertNotFound(id, owner.getId(), false);
	}

	private void assertNotFound(Long productId, Long callerUserId, boolean admin) {
		assertThatThrownBy(() -> productCatalogService.getDetail(productId, callerUserId, admin))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	/**
	 * {@code registerAsset}이 아니라 {@code attachAsset}으로 붙인다 — 전자는 운영진 등록 경로라 곧바로
	 * {@code approve()}를 부르고, 그러면 검수 대기 상태를 만들 수 없다.
	 */
	private Long 검수대기_자작_제품() {
		Product product = productRepository.save(소품(ProductSource.USER, owner));
		product.attachAsset(Asset.create(product, "assets/user.glb", GlbExportMode.TEXTURE, null,
				30_000, null));
		entityManager.flush();
		entityManager.clear();
		return product.getId();
	}

	private Prop 소품(ProductSource source, User productOwner) {
		return Prop.create(source, productOwner, null, category, "받침대", null, null, null,
				300, 200, 100, 1_200, true, MountSurface.TOP);
	}

	/** 목록 테스트 전용 — 아직 저장하지 않은 모니터 엔티티. 에셋 유무는 호출부가 붙인다. */
	private Monitor 모니터(Category productCategory, String name, Integer priceKrw) {
		return Monitor.create(ProductSource.CATALOG, null, brand, productCategory, name, null,
				priceKrw, null, new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130,
				true, true, null, null, null, null, 5_000, null);
	}

	/** 목록 테스트 전용 — 검수 통과 에셋까지 붙여 곧바로 카탈로그에 뜨는 모니터. */
	private Long 승인된_모니터(Category productCategory, String name, Integer priceKrw) {
		Long id = productRepository.save(모니터(productCategory, name, priceKrw)).getId();
		Product product = productRepository.findById(id).orElseThrow();
		product.registerAsset("assets/" + id + ".glb", GlbExportMode.TEXTURE, null, 10_000, null);
		entityManager.flush();
		entityManager.clear();
		return id;
	}

	/** 목록 테스트 전용 — 검수 통과 에셋까지 붙여 곧바로 카탈로그에 뜨는 소품. */
	private Long 승인된_소품() {
		Long id = productRepository.save(소품(ProductSource.CATALOG, null)).getId();
		Product product = productRepository.findById(id).orElseThrow();
		product.registerAsset("assets/prop-" + id + ".glb", GlbExportMode.TEXTURE, null, 5_000, null);
		entityManager.flush();
		entityManager.clear();
		return id;
	}
}
