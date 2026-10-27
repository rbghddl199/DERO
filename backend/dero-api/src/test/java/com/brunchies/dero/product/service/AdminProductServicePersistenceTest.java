package com.brunchies.dero.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.ArmKind;
import com.brunchies.dero.product.ArmType;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.PanelShape;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.ReviewResult;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductCreateRequest;
import com.brunchies.dero.product.dto.AdminProductPatchRequest;
import com.brunchies.dero.product.dto.AdminProductResponse;
import com.brunchies.dero.product.dto.AdminProductReviewRequest;
import com.brunchies.dero.product.dto.AdminProductSummaryResponse;
import com.brunchies.dero.product.dto.ArmSpecRequest;
import com.brunchies.dero.product.dto.DeskSpecRequest;
import com.brunchies.dero.product.dto.MonitorSpecRequest;
import com.brunchies.dero.product.dto.PropSpecRequest;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 관리자 제품 등록→목록→검수 왕복을 실제 Postgres로 검증한다(REQ-ADM-01·02·04).
 *
 * <p>여기가 확인하는 것은 슬라이스 테스트가 못 보는 것들이다 — JOINED 서브타입이 자식 테이블까지
 * 저장되는가, 목록 프로젝션이 판별자({@code p.specType})까지 실제 SQL로 번역되는가, 검수가
 * {@code Product} 루트를 통해 {@code asset}에 닿는가.
 */
class AdminProductServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private AdminProductService adminProductService;

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
	private EntityManager entityManager;

	private Long brandId;
	private Long categoryId;
	private Long deskTextureId;
	private Long vesa75Id;
	private Long vesa100Id;
	private Long vesa200Id;

	@BeforeEach
	void setUp() {
		brandId = brandRepository.save(Brand.create("델", null, null, null)).getId();
		categoryId = categoryRepository.save(Category.createRoot("모니터", null, 1)).getId();
		deskTextureId = deskTextureRepository.save(DeskTexture.create("오크", "#C9A876", null, null,
				null, BigDecimal.ONE, BigDecimal.ZERO, null, 1)).getId();
		vesa75Id = vesaSpecRepository.save(VesaSpec.create(75, 75)).getId();
		vesa100Id = vesaSpecRepository.save(VesaSpec.create(100, 100)).getId();
		vesa200Id = vesaSpecRepository.save(VesaSpec.create(200, 100)).getId();
	}

	@Test
	@DisplayName("모니터를 등록하면 product와 monitor 두 테이블에 저장되고 source는 CATALOG다")
	void 등록_모니터() {
		AdminProductResponse response = adminProductService.create(모니터_등록());

		assertThat(response.id()).isNotNull();
		assertThat(response.specType()).isEqualTo(SpecType.MONITOR);
		assertThat(response.source()).isEqualTo(ProductSource.CATALOG);

		entityManager.flush();
		entityManager.clear();

		Monitor saved = (Monitor) productRepository.findById(response.id()).orElseThrow();
		assertThat(saved.getDiagonalInch()).isEqualByComparingTo("27.0");
		assertThat(saved.isStandDetachable()).isTrue();
		assertThat(saved.getWeightG()).isEqualTo(5_000);
		assertThat(saved.getBrand().getId()).isEqualTo(brandId);
	}

	@Test
	@DisplayName("책상을 등록해도 asset 행은 생기지 않는다 — 절차 생성이라 GLB가 없다(D18)")
	void 등록_책상은_에셋_없음() {
		AdminProductResponse response = adminProductService.create(책상_등록());

		entityManager.flush();
		entityManager.clear();

		Product saved = productRepository.findById(response.id()).orElseThrow();
		assertThat(saved.getAsset()).isNull();
		assertThat(SpecType.of(saved)).isEqualTo(SpecType.DESK);
	}

	@Test
	@DisplayName("specType과 규격 본문이 어긋나면 400 PRODUCT_SPEC_BODY_MISMATCH다")
	void 등록_규격_본문_불일치() {
		AdminProductCreateRequest 본문 = new AdminProductCreateRequest(SpecType.MONITOR, brandId,
				categoryId, "이상한 제품", null, 100_000, "https://example.com/x", null,
				책상_규격(), null, null, null, null);

		assertThatThrownBy(() -> adminProductService.create(본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SPEC_BODY_MISMATCH));
	}

	@Test
	@DisplayName("평면 모니터에 곡률 반경을 넣으면 422다 — CHECK가 없어 WAS가 막는다")
	void 등록_평면_곡률() {
		MonitorSpecRequest 규격 = new MonitorSpecRequest(new BigDecimal("27.0"), 16, 9, 8, null,
				PanelShape.FLAT, 1800, 130, true, true, null, null, null, null, 5_000, null);
		AdminProductCreateRequest 본문 = new AdminProductCreateRequest(SpecType.MONITOR, brandId,
				categoryId, "U2723QE", null, 700_000, "https://example.com/u2723qe", null,
				null, 규격, null, null, null);

		assertThatThrownBy(() -> adminProductService.create(본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SPEC_CURVATURE_NOT_ALLOWED));
	}

	@Test
	@DisplayName("자립형 암에 클램프 지원을 켜면 422다")
	void 등록_자립형_클램프() {
		ArmSpecRequest 규격 = new ArmSpecRequest(ArmKind.MONITOR, ArmType.STAND, 1, null, null, null,
				null, null, null, true, false, false, null, null, null, null, null, null, false,
				false, 8_000);
		AdminProductCreateRequest 본문 = new AdminProductCreateRequest(SpecType.ARM, brandId,
				categoryId, "자립형 암", null, 90_000, "https://example.com/arm", null,
				null, null, 규격, null, null);

		assertThatThrownBy(() -> adminProductService.create(본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SPEC_STAND_ARM_INVALID));
	}

	@Test
	@DisplayName("부분 수정은 보낸 필드만 바꾸고 나머지는 그대로 둔다 (dirty checking)")
	void 수정_부분() {
		Long id = adminProductService.create(모니터_등록()).id();
		MonitorSpecRequest 규격_일부 = new MonitorSpecRequest(null, null, null, null, null, null, null,
				null, null, null, null, null, null, null, 6_100, null);

		adminProductService.update(id, new AdminProductPatchRequest(null, null, null, "U2723QE 개정",
				null, null, null, null, null, null, 규격_일부, null, null, null));

		entityManager.flush();
		entityManager.clear();

		Monitor saved = (Monitor) productRepository.findById(id).orElseThrow();
		assertThat(saved.getName()).isEqualTo("U2723QE 개정");
		assertThat(saved.getWeightG()).isEqualTo(6_100);
		assertThat(saved.getDiagonalInch()).isEqualByComparingTo("27.0");
		assertThat(saved.getPriceKrw()).isEqualTo(700_000);
	}

	@Test
	@DisplayName("규격 타입을 바꾸려 하면 422 PRODUCT_SPEC_TYPE_IMMUTABLE이다 (ADR-0006 결정 4)")
	void 수정_규격타입_불변() {
		Long id = adminProductService.create(모니터_등록()).id();
		AdminProductPatchRequest 본문 = new AdminProductPatchRequest(SpecType.DESK, null, null, null,
				null, null, null, null, null, null, null, null, null, null);

		assertThatThrownBy(() -> adminProductService.update(id, 본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SPEC_TYPE_IMMUTABLE));
	}

	@Test
	@DisplayName("status를 보내면 카탈로그에서 내렸다 올릴 수 있고, 안 보내면 그대로다")
	void 수정_노출_상태() {
		Long id = adminProductService.create(모니터_등록()).id();

		assertThat(adminProductService.update(id, 상태_수정(ProductStatus.HIDDEN)).status())
				.isEqualTo(ProductStatus.HIDDEN);
		entityManager.flush();
		entityManager.clear();
		assertThat(productRepository.findById(id).orElseThrow().getStatus())
				.isEqualTo(ProductStatus.HIDDEN);

		// status를 안 보낸 수정은 노출 상태를 건드리지 않는다 — NULL은 "안 바꾼다"다.
		adminProductService.update(id, new AdminProductPatchRequest(null, null, null, "이름만 변경",
				null, null, null, null, null, null, null, null, null, null));
		entityManager.flush();
		entityManager.clear();
		assertThat(productRepository.findById(id).orElseThrow().getStatus())
				.isEqualTo(ProductStatus.HIDDEN);

		assertThat(adminProductService.update(id, 상태_수정(ProductStatus.ACTIVE)).status())
				.isEqualTo(ProductStatus.ACTIVE);
		entityManager.flush();
		entityManager.clear();
		assertThat(productRepository.findById(id).orElseThrow().getStatus())
				.isEqualTo(ProductStatus.ACTIVE);
	}

	private AdminProductPatchRequest 상태_수정(ProductStatus status) {
		return new AdminProductPatchRequest(null, null, null, null, null, null, null, status,
				null, null, null, null, null, null);
	}

	@Test
	@DisplayName("삭제는 deleted_at을 찍고 목록·조회에서 빠진다")
	void 삭제() {
		Long id = adminProductService.create(모니터_등록()).id();

		adminProductService.delete(id);
		entityManager.flush();

		assertThat(productRepository.findByIdAndDeletedAtIsNull(id)).isEmpty();
		assertThat(adminProductService.list(null, null, null, null, 0, 20).content()).isEmpty();
	}

	@Test
	@DisplayName("목록은 규격 타입·브랜드명·검수 상태를 한 쿼리로 뽑고 status로 거른다")
	void 목록() {
		Long monitorId = adminProductService.create(모니터_등록()).id();
		adminProductService.create(책상_등록());
		adminProductService.create(암_등록());
		에셋_붙이기(monitorId);
		entityManager.flush();
		entityManager.clear();

		OffsetPage<AdminProductSummaryResponse> 전체 =
				adminProductService.list(null, null, null, null, 0, 20);
		assertThat(전체.content()).hasSize(3);
		assertThat(전체.content()).extracting(AdminProductSummaryResponse::specType)
				.containsExactlyInAnyOrder(SpecType.MONITOR, SpecType.DESK, SpecType.ARM);
		assertThat(전체.page().totalElements()).isEqualTo(3);

		OffsetPage<AdminProductSummaryResponse> 검수대기 =
				adminProductService.list(ReviewStatus.PENDING, null, null, null, 0, 20);
		assertThat(검수대기.content()).hasSize(1);
		AdminProductSummaryResponse 한줄 = 검수대기.content().get(0);
		assertThat(한줄.id()).isEqualTo(monitorId);
		assertThat(한줄.specType()).isEqualTo(SpecType.MONITOR);
		assertThat(한줄.brandName()).isEqualTo("델");
		assertThat(한줄.categoryName()).isEqualTo("모니터");
		assertThat(한줄.reviewStatus()).isEqualTo(ReviewStatus.PENDING);
	}

	@Test
	@DisplayName("목록은 브랜드를 정확히 필터링하고 상위 카테고리에 하위 제품을 롤업한다")
	void 목록_브랜드_카테고리_필터() {
		Long 기본제품 = adminProductService.create(모니터_등록()).id();
		Long 다른브랜드 = brandRepository.save(Brand.create("삼성", null, null, null)).getId();
		Category 주변기기 = categoryRepository.save(Category.createRoot("주변기기", null, 2));
		Long 웹캠 = categoryRepository.save(Category.createChild(주변기기, "웹캠", null, 1)).getId();
		Long 하위제품 = adminProductService.create(
				모니터_등록(다른브랜드, 웹캠, "웹캠 모니터")).id();
		entityManager.flush();
		entityManager.clear();

		assertThat(adminProductService.list(null, brandId, null, null, 0, 20).content())
				.extracting(AdminProductSummaryResponse::id)
				.containsExactly(기본제품);
		assertThat(adminProductService.list(null, null, 주변기기.getId(), null, 0, 20).content())
				.extracting(AdminProductSummaryResponse::id)
				.containsExactly(하위제품);
		assertThat(adminProductService.list(null, null, null, "  웹캠  ", 0, 20).content())
				.extracting(AdminProductSummaryResponse::id)
				.containsExactly(하위제품);
	}

	@Test
	@DisplayName("승인은 review_status를 APPROVED로 올리고 verified_at을 남긴다")
	void 검수_승인() {
		Long id = adminProductService.create(모니터_등록()).id();
		에셋_붙이기(id);
		entityManager.flush();
		entityManager.clear();

		adminProductService.review(id, new AdminProductReviewRequest(ReviewResult.APPROVED, null));
		entityManager.flush();
		entityManager.clear();

		Asset asset = productRepository.findById(id).orElseThrow().getAsset();
		assertThat(asset.getReviewStatus()).isEqualTo(ReviewStatus.APPROVED);
		assertThat(asset.getVerifiedAt()).isNotNull();
		assertThat(asset.getReviewNote()).isNull();
	}

	@Test
	@DisplayName("반려는 사유를 남기고 verified_at은 건드리지 않는다")
	void 검수_반려() {
		Long id = adminProductService.create(모니터_등록()).id();
		에셋_붙이기(id);
		entityManager.flush();
		entityManager.clear();

		adminProductService.review(id,
				new AdminProductReviewRequest(ReviewResult.REJECTED, "폴리곤이 너무 많습니다."));
		entityManager.flush();
		entityManager.clear();

		Asset asset = productRepository.findById(id).orElseThrow().getAsset();
		assertThat(asset.getReviewStatus()).isEqualTo(ReviewStatus.REJECTED);
		assertThat(asset.getReviewNote()).isEqualTo("폴리곤이 너무 많습니다.");
		assertThat(asset.getVerifiedAt()).isNull();
	}

	@Test
	@DisplayName("사유 없는 반려는 400 PRODUCT_REVIEW_NOTE_REQUIRED다")
	void 검수_반려_사유_없음() {
		Long id = adminProductService.create(모니터_등록()).id();
		에셋_붙이기(id);
		entityManager.flush();
		entityManager.clear();

		AdminProductReviewRequest 본문 = new AdminProductReviewRequest(ReviewResult.REJECTED, "  ");
		assertThatThrownBy(() -> adminProductService.review(id, 본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_REVIEW_NOTE_REQUIRED));
	}

	@Test
	@DisplayName("에셋이 없는 책상을 검수하면 422 PRODUCT_ASSET_NOT_FOUND다")
	void 검수_에셋_없음() {
		Long id = adminProductService.create(책상_등록()).id();
		entityManager.flush();
		entityManager.clear();

		AdminProductReviewRequest 본문 = new AdminProductReviewRequest(ReviewResult.APPROVED, null);
		assertThatThrownBy(() -> adminProductService.review(id, 본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_ASSET_NOT_FOUND));
	}

	@Test
	@DisplayName("소품도 같은 경로로 등록되고 mount_surface가 저장된다")
	void 등록_소품() {
		AdminProductCreateRequest 본문 = new AdminProductCreateRequest(SpecType.PROP, brandId,
				categoryId, "O11 다이내믹", null, 189_000, "https://example.com/o11", null,
				null, null, null, null,
				new PropSpecRequest(272, 446, 446, 11_000, false, MountSurface.FLOOR));

		Long id = adminProductService.create(본문).id();
		entityManager.flush();
		entityManager.clear();

		Prop saved = (Prop) productRepository.findById(id).orElseThrow();
		assertThat(saved.getMountSurface()).isEqualTo(MountSurface.FLOOR);
		assertThat(saved.isStackable()).isFalse();
		assertThat(saved.getWeightG()).isEqualTo(11_000);
	}

	// --- VESA 태깅 (DERO-324) ---

	@Test
	@DisplayName("모니터를 VESA 규격 2건과 함께 등록하면 product_vesa 2행이 저장된다")
	void 등록_VESA_태깅() {
		Long id = adminProductService.create(모니터_등록(List.of(vesa75Id, vesa100Id))).id();
		entityManager.flush();
		entityManager.clear();

		assertThat(태깅된_규격_id(id)).containsExactlyInAnyOrder(vesa75Id, vesa100Id);
	}

	/**
	 * 이 테스트의 존재 이유는 {@code Product.replaceVesaSpecs}가 <b>diff</b>여야 한다는 것이다 —
	 * {@code clear()} + {@code addAll()} 구현이면 Hibernate가 INSERT를 DELETE보다 먼저 내서
	 * {@code uq_product_vesa_product_id_vesa_spec_id} 위반으로 여기서 죽는다.
	 */
	@Test
	@DisplayName("겹치는 집합으로 교체해도 유니크 위반 없이 그 집합만 남는다 ({A} → {A,B} → {B,C})")
	void 수정_VESA_겹치는_교체() {
		Long id = adminProductService.create(모니터_등록(List.of(vesa75Id))).id();
		entityManager.flush();
		entityManager.clear();

		adminProductService.update(id, VESA_수정(List.of(vesa75Id, vesa100Id)));
		entityManager.flush();
		entityManager.clear();
		assertThat(태깅된_규격_id(id)).containsExactlyInAnyOrder(vesa75Id, vesa100Id);

		// 겹치면서 줄어드는 방향도 남을 것만 남긴다.
		adminProductService.update(id, VESA_수정(List.of(vesa100Id, vesa200Id)));
		entityManager.flush();
		entityManager.clear();
		assertThat(태깅된_규격_id(id)).containsExactlyInAnyOrder(vesa100Id, vesa200Id);
	}

	@Test
	@DisplayName("vesaSpecIds가 빈 배열이면 전부 떼고, 필드를 안 보내면(NULL) 기존 태깅이 남는다")
	void 수정_VESA_비움과_유지() {
		Long id = adminProductService.create(모니터_등록(List.of(vesa75Id, vesa100Id))).id();
		entityManager.flush();
		entityManager.clear();

		// NULL은 "안 바꾼다"다 — 이름만 고치는 요청이 태깅을 지우면 안 된다.
		adminProductService.update(id, new AdminProductPatchRequest(null, null, null, "이름만 변경",
				null, null, null, null, null, null, null, null, null, null));
		entityManager.flush();
		entityManager.clear();
		assertThat(태깅된_규격_id(id)).containsExactlyInAnyOrder(vesa75Id, vesa100Id);

		adminProductService.update(id, VESA_수정(List.of()));
		entityManager.flush();
		entityManager.clear();
		assertThat(태깅된_규격_id(id)).isEmpty();
	}

	@Test
	@DisplayName("소품에 VESA를 붙이려 하면 422 PRODUCT_VESA_NOT_APPLICABLE이다 — 조용히 무시하지 않는다")
	void 등록_소품_VESA_불가() {
		AdminProductCreateRequest 본문 = new AdminProductCreateRequest(SpecType.PROP, brandId,
				categoryId, "받침대", null, 10_000, "https://example.com/prop", List.of(vesa75Id),
				null, null, null, null,
				new PropSpecRequest(300, 200, 100, 1_200, true, MountSurface.TOP));

		assertThatThrownBy(() -> adminProductService.create(본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_VESA_NOT_APPLICABLE));
	}

	@Test
	@DisplayName("소프트 삭제된 VESA 규격은 없는 것이라 404 PRODUCT_VESA_SPEC_NOT_FOUND다")
	void 등록_VESA_삭제된_규격() {
		VesaSpec 내린_규격 = vesaSpecRepository.save(VesaSpec.create(400, 400));
		내린_규격.softDelete();
		entityManager.flush();
		entityManager.clear();

		AdminProductCreateRequest 본문 = 모니터_등록(List.of(내린_규격.getId()));
		assertThatThrownBy(() -> adminProductService.create(본문))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_VESA_SPEC_NOT_FOUND));
	}

	@Test
	@DisplayName("같은 VESA id를 두 번 보내도 저장은 1행이다 — 중복은 서비스가 접는다")
	void 등록_VESA_중복_id() {
		Long id = adminProductService.create(모니터_등록(List.of(vesa75Id, vesa75Id))).id();
		entityManager.flush();
		entityManager.clear();

		assertThat(태깅된_규격_id(id)).containsExactly(vesa75Id);
	}

	private AdminProductPatchRequest VESA_수정(List<Long> vesaSpecIds) {
		return new AdminProductPatchRequest(null, null, null, null, null, null, null, null,
				vesaSpecIds, null, null, null, null, null);
	}

	/** {@code getVesaSpec().getId()}는 식별자 게터라 프록시를 초기화하지 않는다. */
	private List<Long> 태깅된_규격_id(Long productId) {
		return productRepository.findById(productId).orElseThrow().getVesas().stream()
				.map(vesa -> vesa.getVesaSpec().getId())
				.toList();
	}

	/**
	 * 검수 대상을 만들려면 {@code asset} 행이 필요한데 등록 API는 그것을 만들지 않는다(GLB 업로드는
	 * 별도 경로). {@code AssetRepository}가 없으므로(ADR-0007) 루트를 통해 붙인다.
	 */
	private void 에셋_붙이기(Long productId) {
		Product product = productRepository.findById(productId).orElseThrow();
		product.attachAsset(Asset.create(product, "assets/" + productId + ".glb",
				GlbExportMode.TEXTURE, null, 12_000, null));
	}

	private AdminProductCreateRequest 모니터_등록() {
		return 모니터_등록(null);
	}

	private AdminProductCreateRequest 모니터_등록(List<Long> vesaSpecIds) {
		return 모니터_등록(brandId, categoryId, "U2723QE", vesaSpecIds);
	}

	private AdminProductCreateRequest 모니터_등록(
			Long targetBrandId, Long targetCategoryId, String name) {
		return 모니터_등록(targetBrandId, targetCategoryId, name, null);
	}

	private AdminProductCreateRequest 모니터_등록(
			Long targetBrandId, Long targetCategoryId, String name, List<Long> vesaSpecIds) {
		return new AdminProductCreateRequest(
				SpecType.MONITOR, targetBrandId, targetCategoryId, name, null,
				700_000, "https://example.com/u2723qe", vesaSpecIds, null,
				new MonitorSpecRequest(new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null,
						130, true, true, null, null, null, null, 5_000, List.of("HDMI 2.0", "DP 1.4")),
				null, null, null);
	}

	private AdminProductCreateRequest 책상_등록() {
		return new AdminProductCreateRequest(SpecType.DESK, brandId, categoryId, "1400 책상", null,
				250_000, "https://example.com/desk", null, 책상_규격(), null, null, null, null);
	}

	private AdminProductCreateRequest 암_등록() {
		return new AdminProductCreateRequest(SpecType.ARM, brandId, categoryId, "자립형 암", null,
				90_000, "https://example.com/arm", null, null, null,
				new ArmSpecRequest(ArmKind.MONITOR, ArmType.STAND, 1, null, null, null, null, null,
						null, false, false, false, null, null, null, null, null, null, false, false,
						8_000),
				null, null);
	}

	private DeskSpecRequest 책상_규격() {
		return new DeskSpecRequest(1400, 700, 720, 25, 30, false, deskTextureId,
				FrameType.T_FRAME, null);
	}
}
