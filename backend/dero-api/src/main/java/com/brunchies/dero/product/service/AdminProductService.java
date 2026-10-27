package com.brunchies.dero.product.service;

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
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.ArmMounting;
import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Light;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductChangedEvent;
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
import com.brunchies.dero.product.dto.LightSpecRequest;
import com.brunchies.dero.product.dto.MonitorSpecRequest;
import com.brunchies.dero.product.dto.PropSpecRequest;
import com.brunchies.dero.product.repository.ProductRepository;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영진 제품 관리 — {@code /admin/products}(`docs/context/api-spec.md` §9, REQ-ADM-01·02·04).
 *
 * <p><b>등록되는 제품은 전부 {@code source = CATALOG}다.</b> 자작 업로드({@code USER})는
 * {@code POST /products}의 몫이고, 두 경로는 필수 컬럼 규칙이 정반대다(erd.md {@code product} 절의
 * source별 필수 표) — 한 서비스가 둘 다 하면 그 분기가 메서드마다 번진다.
 *
 * <p><b>검수 대상은 {@code asset}이지만 리소스는 {@code product}다</b>(D20 — 자작 업로드도
 * {@code product} 행이다). {@code AssetRepository}가 없으므로(ADR-0007) 검수도 루트를 통과한다.
 *
 * <p><b>부분 수정(PATCH)의 병합은 여기서 끝낸다</b> — 엔티티의 {@code updateSpec}은 전 필드를 받는다.
 * 엔티티가 NULL을 "무시"로 해석하기 시작하면 nullable 필드를 진짜 NULL로 되돌리는 길이 막히고,
 * 어느 필드가 어느 규칙을 따르는지가 필드마다 갈린다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminProductService {

	private final ProductRepository products;
	private final BrandRepository brands;
	private final CategoryRepository categories;
	private final DeskTextureRepository deskTextures;
	private final VesaSpecRepository vesaSpecs;

	/**
	 * 검색 색인 신호를 커밋 후로 미룬다(ADR-0019 결정 3) — 여기서 직접 ES를 부르면 롤백된
	 * 트랜잭션의 유령 문서가 검색에 남는다. 받는 쪽은 {@code ProductSearchIndexListener}.
	 */
	private final ApplicationEventPublisher events;

	/**
	 * 검수 목록. {@code reviewStatus}가 NULL이면 전체(소프트 삭제 제외)다.
	 *
	 * <p>정렬은 쿼리에 {@code order by p.id desc}로 박혀 있어 {@link PageRequest}에 정렬을 넣지
	 * 않는다 — 두 곳에 정렬을 두면 어느 쪽이 이기는지가 조용히 갈린다.
	 */
	public OffsetPage<AdminProductSummaryResponse> list(
			ReviewStatus reviewStatus, Long brandId, Long categoryId, String keyword,
			int page, int size) {
		return OffsetPage.from(products.findAdminProducts(
				reviewStatus, brandId, categoryId, keyword, PageRequest.of(page, size)));
	}

	/** 제품 등록(REQ-ADM-01). 규격 서브타입 5종의 정적 팩터리를 {@code specType}으로 갈라 부른다. */
	@Transactional
	public AdminProductResponse create(AdminProductCreateRequest request) {
		requireExactlySpecBodyOf(request.specType(),
				request.desk(), request.monitor(), request.arm(), request.light(), request.prop());
		requireVesaApplicable(request.specType(), request.vesaSpecIds());

		Brand brand = brand(request.brandId());
		Category category = category(request.categoryId());
		Product product = switch (request.specType()) {
			case DESK -> newDesk(request, brand, category);
			case MONITOR -> newMonitor(request, brand, category);
			case ARM -> newArm(request, brand, category);
			case LIGHT -> newLight(request, brand, category);
			case PROP -> newProp(request, brand, category);
		};
		if (request.vesaSpecIds() != null) {
			// save() 전에 붙여야 cascade가 정션까지 같이 저장한다.
			product.replaceVesaSpecs(resolveVesaSpecs(request.vesaSpecIds()));
		}

		Product saved = products.save(product);
		events.publishEvent(new ProductChangedEvent(saved.getId()));
		return AdminProductResponse.from(saved);
	}

	/**
	 * 규격·메타데이터 부분 수정(REQ-ADM-02). 영속 엔티티라 {@code save()}를 부르지 않는다 —
	 * 커밋 시 dirty checking이 UPDATE를 낸다(규칙 13).
	 */
	@Transactional
	public AdminProductResponse update(Long productId, AdminProductPatchRequest request) {
		Product product = requireProduct(productId);
		SpecType specType = requireUnchangedSpecType(product, request.specType());
		requireAtMostSpecBodyOf(specType,
				request.desk(), request.monitor(), request.arm(), request.light(), request.prop());
		requireVesaApplicable(specType, request.vesaSpecIds());

		product.updateCommon(
				request.brandId() == null ? product.getBrand() : brand(request.brandId()),
				request.categoryId() == null ? product.getCategory() : category(request.categoryId()),
				orKeep(request.name(), product.getName()),
				orKeep(request.description(), product.getDescription()),
				orKeep(request.priceKrw(), product.getPriceKrw()),
				orKeep(request.productUrl(), product.getProductUrl()));
		applyStatus(product, request.status());

		switch (product) {
			case Desk desk -> patchDesk(desk, request.desk());
			case Monitor monitor -> patchMonitor(monitor, request.monitor());
			case Arm arm -> patchArm(arm, request.arm());
			case Light light -> patchLight(light, request.light());
			case Prop prop -> patchProp(prop, request.prop());
			default -> throw new BusinessException(ProductErrorCode.PRODUCT_UNKNOWN_SPEC_SUBTYPE);
		}

		// NULL은 "안 바꾼다", 빈 배열은 "전부 뗀다"다 — 리스트는 []로 비움을 표현할 수 있다.
		if (request.vesaSpecIds() != null) {
			product.replaceVesaSpecs(resolveVesaSpecs(request.vesaSpecIds()));
		}

		events.publishEvent(new ProductChangedEvent(productId));
		return AdminProductResponse.from(product);
	}

	/**
	 * 삭제. {@code status = HIDDEN}이 아니라 {@code deleted_at}을 찍는다 — 카탈로그에서 잠시 내리는
	 * 것({@code hide()})과 삭제는 다른 축이고, 명세가 이 경로에 {@code DELETE}를 두었다.
	 */
	@Transactional
	public void delete(Long productId) {
		requireProduct(productId).softDelete();
		events.publishEvent(new ProductChangedEvent(productId));
	}

	/**
	 * 검수 승인·반려(REQ-ADM-04). {@code asset} 행이 없는 제품(책상은 절차 생성이라 애초에 없다)은
	 * 검수 대상이 아니므로 422다 — 빈 성공을 돌려주면 운영진이 "승인했다"고 믿게 된다.
	 */
	@Transactional
	public void review(Long productId, AdminProductReviewRequest request) {
		Asset asset = requireProduct(productId).getAsset();
		if (asset == null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_ASSET_NOT_FOUND);
		}

		if (request.result() == ReviewResult.REJECTED) {
			if (request.note() == null || request.note().isBlank()) {
				throw new BusinessException(ProductErrorCode.PRODUCT_REVIEW_NOTE_REQUIRED);
			}
			asset.reject(request.note());
			return;
		}
		asset.approve();
	}

	// --- 등록 ---

	private Desk newDesk(AdminProductCreateRequest request, Brand brand, Category category) {
		DeskSpecRequest spec = request.desk();
		return Desk.create(ProductSource.CATALOG, null, brand, category, request.name(),
				request.description(), request.priceKrw(), request.productUrl(),
				spec.widthMm(), spec.depthMm(), spec.heightMm(), spec.topThicknessMm(),
				spec.edgeThicknessMm(), spec.isRounded(), deskTexture(spec.deskTextureId()),
				spec.frameType(), spec.allowedLoadG());
	}

	private Monitor newMonitor(AdminProductCreateRequest request, Brand brand, Category category) {
		MonitorSpecRequest spec = request.monitor();
		return Monitor.create(ProductSource.CATALOG, null, brand, category, request.name(),
				request.description(), request.priceKrw(), request.productUrl(),
				spec.diagonalInch(), spec.aspectWidth(), spec.aspectHeight(), spec.bezelMm(),
				spec.panelThicknessMm(), spec.panelShape(), spec.curvatureRadiusMm(),
				spec.standDepthMm(), spec.isStandDetachable(), spec.isPivotSupported(),
				spec.swivelMaxDeg(), spec.heightAdjustRangeMm(), spec.tiltMinDeg(), spec.tiltMaxDeg(),
				spec.weightG(), spec.ports());
	}

	private Arm newArm(AdminProductCreateRequest request, Brand brand, Category category) {
		ArmSpecRequest spec = request.arm();
		return Arm.create(ProductSource.CATALOG, null, brand, category, request.name(),
				request.description(), request.priceKrw(), request.productUrl(),
				spec.armKind(), spec.armType(), spec.deviceCapacity(), spec.segmentCount(),
				spec.poleHeightMm(), spec.reachMinMm(), spec.reachMaxMm(), spec.heightMinMm(),
				spec.heightMaxMm(),
				new ArmMounting(spec.isClampMountable(), spec.isGrommetMountable(),
						spec.isWallMountable()),
				spec.clampMinMm(), spec.clampMaxMm(), spec.tiltMinDeg(), spec.tiltMaxDeg(),
				spec.swivelRangeDeg(), spec.pivotRangeDeg(), spec.isVesaPlateDetachable(),
				spec.hasCableManagement(), spec.allowedLoadG());
	}

	private Light newLight(AdminProductCreateRequest request, Brand brand, Category category) {
		LightSpecRequest spec = request.light();
		return Light.create(ProductSource.CATALOG, null, brand, category, request.name(),
				request.description(), request.priceKrw(), request.productUrl(),
				spec.widthMm(), spec.depthMm(), spec.heightMm(),
				spec.isColorTemperatureAdjustable(), spec.colorTemperatureMinK(),
				spec.colorTemperatureMaxK(), spec.isBrightnessAdjustable(), spec.luminousFluxMinLm(),
				spec.luminousFluxMaxLm(), spec.distribution(), spec.reachMm());
	}

	private Prop newProp(AdminProductCreateRequest request, Brand brand, Category category) {
		PropSpecRequest spec = request.prop();
		return Prop.create(ProductSource.CATALOG, null, brand, category, request.name(),
				request.description(), request.priceKrw(), request.productUrl(),
				spec.widthMm(), spec.depthMm(), spec.heightMm(), spec.weightG(), spec.isStackable(),
				spec.mountSurface());
	}

	// --- 부분 수정 ---

	private void patchDesk(Desk desk, DeskSpecRequest spec) {
		if (spec == null) {
			return;
		}
		desk.updateSpec(
				orKeep(spec.widthMm(), desk.getWidthMm()),
				orKeep(spec.depthMm(), desk.getDepthMm()),
				orKeep(spec.heightMm(), desk.getHeightMm()),
				orKeep(spec.topThicknessMm(), desk.getTopThicknessMm()),
				orKeep(spec.edgeThicknessMm(), desk.getEdgeThicknessMm()),
				orKeep(spec.isRounded(), desk.isRounded()),
				spec.deskTextureId() == null
						? desk.getDeskTexture() : deskTexture(spec.deskTextureId()),
				orKeep(spec.frameType(), desk.getFrameType()),
				orKeep(spec.allowedLoadG(), desk.getAllowedLoadG()));
	}

	private void patchMonitor(Monitor monitor, MonitorSpecRequest spec) {
		if (spec == null) {
			return;
		}
		monitor.updateSpec(
				orKeep(spec.diagonalInch(), monitor.getDiagonalInch()),
				orKeep(spec.aspectWidth(), monitor.getAspectWidth()),
				orKeep(spec.aspectHeight(), monitor.getAspectHeight()),
				orKeep(spec.bezelMm(), monitor.getBezelMm()),
				orKeep(spec.panelThicknessMm(), monitor.getPanelThicknessMm()),
				orKeep(spec.panelShape(), monitor.getPanelShape()),
				orKeep(spec.curvatureRadiusMm(), monitor.getCurvatureRadiusMm()),
				orKeep(spec.standDepthMm(), monitor.getStandDepthMm()),
				orKeep(spec.isStandDetachable(), monitor.isStandDetachable()),
				orKeep(spec.isPivotSupported(), monitor.isPivotSupported()),
				orKeep(spec.swivelMaxDeg(), monitor.getSwivelMaxDeg()),
				orKeep(spec.heightAdjustRangeMm(), monitor.getHeightAdjustRangeMm()),
				orKeep(spec.tiltMinDeg(), monitor.getTiltMinDeg()),
				orKeep(spec.tiltMaxDeg(), monitor.getTiltMaxDeg()),
				orKeep(spec.weightG(), monitor.getWeightG()),
				orKeep(spec.ports(), monitor.getPorts()));
	}

	private void patchArm(Arm arm, ArmSpecRequest spec) {
		if (spec == null) {
			return;
		}
		ArmMounting mounting = arm.getMounting();
		arm.updateSpec(
				orKeep(spec.armKind(), arm.getArmKind()),
				orKeep(spec.armType(), arm.getArmType()),
				orKeep(spec.deviceCapacity(), arm.getDeviceCapacity()),
				orKeep(spec.segmentCount(), arm.getSegmentCount()),
				orKeep(spec.poleHeightMm(), arm.getPoleHeightMm()),
				orKeep(spec.reachMinMm(), arm.getReachMinMm()),
				orKeep(spec.reachMaxMm(), arm.getReachMaxMm()),
				orKeep(spec.heightMinMm(), arm.getHeightMinMm()),
				orKeep(spec.heightMaxMm(), arm.getHeightMaxMm()),
				new ArmMounting(
						orKeep(spec.isClampMountable(), mounting.clamp()),
						orKeep(spec.isGrommetMountable(), mounting.grommet()),
						orKeep(spec.isWallMountable(), mounting.wall())),
				orKeep(spec.clampMinMm(), arm.getClampMinMm()),
				orKeep(spec.clampMaxMm(), arm.getClampMaxMm()),
				orKeep(spec.tiltMinDeg(), arm.getTiltMinDeg()),
				orKeep(spec.tiltMaxDeg(), arm.getTiltMaxDeg()),
				orKeep(spec.swivelRangeDeg(), arm.getSwivelRangeDeg()),
				orKeep(spec.pivotRangeDeg(), arm.getPivotRangeDeg()),
				orKeep(spec.isVesaPlateDetachable(), arm.isVesaPlateDetachable()),
				orKeep(spec.hasCableManagement(), arm.isHasCableManagement()),
				orKeep(spec.allowedLoadG(), arm.getAllowedLoadG()));
	}

	private void patchLight(Light light, LightSpecRequest spec) {
		if (spec == null) {
			return;
		}
		light.updateSpec(
				orKeep(spec.widthMm(), light.getWidthMm()),
				orKeep(spec.depthMm(), light.getDepthMm()),
				orKeep(spec.heightMm(), light.getHeightMm()),
				orKeep(spec.isColorTemperatureAdjustable(), light.isColorTemperatureAdjustable()),
				orKeep(spec.colorTemperatureMinK(), light.getColorTemperatureMinK()),
				orKeep(spec.colorTemperatureMaxK(), light.getColorTemperatureMaxK()),
				orKeep(spec.isBrightnessAdjustable(), light.isBrightnessAdjustable()),
				orKeep(spec.luminousFluxMinLm(), light.getLuminousFluxMinLm()),
				orKeep(spec.luminousFluxMaxLm(), light.getLuminousFluxMaxLm()),
				orKeep(spec.distribution(), light.getDistribution()),
				orKeep(spec.reachMm(), light.getReachMm()));
	}

	private void patchProp(Prop prop, PropSpecRequest spec) {
		if (spec == null) {
			return;
		}
		prop.updateSpec(
				orKeep(spec.widthMm(), prop.getWidthMm()),
				orKeep(spec.depthMm(), prop.getDepthMm()),
				orKeep(spec.heightMm(), prop.getHeightMm()),
				orKeep(spec.weightG(), prop.getWeightG()),
				orKeep(spec.isStackable(), prop.isStackable()),
				orKeep(spec.mountSurface(), prop.getMountSurface()));
	}

	// --- 공통 ---

	/** PATCH의 "이 필드는 안 바꾼다"(NULL) 규칙 한 곳. */
	private static <T> T orKeep(T requested, T current) {
		return requested != null ? requested : current;
	}

	/**
	 * 카탈로그 노출 전이(REQ-ADM-02). <b>{@code updateCommon}에 섞지 않는다</b> — 그쪽은 값을 갈아끼우는
	 * 자리이고 이쪽은 상태 전이라, 엔티티가 {@code hide()}·{@code activate()}라는 이름으로 따로 갖고
	 * 있는 이유가 그대로 유효하다. NULL은 다른 필드와 같이 "안 바꾼다"다.
	 */
	private static void applyStatus(Product product, ProductStatus status) {
		if (status == null) {
			return;
		}
		switch (status) {
			case ACTIVE -> product.activate();
			case HIDDEN -> product.hide();
		}
	}

	/**
	 * VESA를 붙일 수 있는 규격인지 검사한다 — <b>모니터·암만 VESA를 갖는다</b>(erd.md
	 * {@code monitor}·{@code arm} 절). 짝이 안 맞는 요청을 <b>조용히 무시하지 않는다</b>:
	 * {@link #requireAtMostSpecBodyOf}와 같은 판단으로, 무시하면 "고쳤는데 안 바뀐다"가 된다.
	 *
	 * <p>NULL·빈 배열은 어느 규격에나 허용된다 — 끝 상태가 요청과 같아 멱등이고, 홀 없는 모니터처럼
	 * 태깅이 비어 있는 게 정상인 제품이 있다.
	 */
	private static void requireVesaApplicable(SpecType specType, List<Long> vesaSpecIds) {
		if (vesaSpecIds == null || vesaSpecIds.isEmpty()) {
			return;
		}
		if (specType != SpecType.MONITOR && specType != SpecType.ARM) {
			throw new BusinessException(ProductErrorCode.PRODUCT_VESA_NOT_APPLICABLE);
		}
	}

	/**
	 * 요청 id 목록 → 마스터 엔티티 목록.
	 *
	 * <p><b>중복 id는 여기서 없앤다</b> — 그대로 넘기면 같은 쌍을 두 번 INSERT해
	 * {@code uq_product_vesa_product_id_vesa_spec_id}에 걸린다. 중복은 클라이언트 실수일 뿐 요청의
	 * 끝 상태({@code 그 규격이 붙어 있다})는 하나라서 거절하지 않고 접는다.
	 *
	 * <p>소프트 삭제된 규격은 <b>없는 것</b>이다({@code findByIdAndDeletedAtIsNull}, 규칙 2) — 내린
	 * 마스터를 새로 붙일 수 있으면 삭제가 의미를 잃는다.
	 */
	private List<VesaSpec> resolveVesaSpecs(List<Long> vesaSpecIds) {
		return vesaSpecIds.stream()
				.distinct()
				.map(id -> vesaSpecs.findByIdAndDeletedAtIsNull(id)
						.orElseThrow(() -> new BusinessException(
								ProductErrorCode.PRODUCT_VESA_SPEC_NOT_FOUND)))
				.toList();
	}

	/** 등록 — {@code specType}에 해당하는 규격 객체가 <b>정확히 하나만</b> 채워져야 한다. */
	private static void requireExactlySpecBodyOf(SpecType specType, DeskSpecRequest desk,
			MonitorSpecRequest monitor, ArmSpecRequest arm, LightSpecRequest light,
			PropSpecRequest prop) {
		long filled = filledCount(desk, monitor, arm, light, prop);
		if (filled != 1 || specBodyOf(specType, desk, monitor, arm, light, prop) == null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_BODY_MISMATCH);
		}
	}

	/**
	 * 수정 — 규격 객체는 아예 없어도 되지만(공통 필드만 고치는 경우) 있으면 제품의 실제 규격과 짝이
	 * 맞아야 한다. 짝이 안 맞는 객체를 조용히 무시하면 "고쳤는데 안 바뀐다"가 된다.
	 */
	private static void requireAtMostSpecBodyOf(SpecType specType, DeskSpecRequest desk,
			MonitorSpecRequest monitor, ArmSpecRequest arm, LightSpecRequest light,
			PropSpecRequest prop) {
		long filled = filledCount(desk, monitor, arm, light, prop);
		if (filled > 1
				|| (filled == 1 && specBodyOf(specType, desk, monitor, arm, light, prop) == null)) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_BODY_MISMATCH);
		}
	}

	private static Object specBodyOf(SpecType specType, DeskSpecRequest desk,
			MonitorSpecRequest monitor, ArmSpecRequest arm, LightSpecRequest light,
			PropSpecRequest prop) {
		return switch (specType) {
			case DESK -> desk;
			case MONITOR -> monitor;
			case ARM -> arm;
			case LIGHT -> light;
			case PROP -> prop;
		};
	}

	private static long filledCount(Object... bodies) {
		return Stream.of(bodies).filter(Objects::nonNull).count();
	}

	/**
	 * {@code spec_type} 불변 검사(ADR-0006 결정 4). 요청이 값을 안 보내면 검사할 것이 없고, 보냈으면
	 * 제품의 실제 규격과 같아야 한다.
	 */
	private static SpecType requireUnchangedSpecType(Product product, SpecType requested) {
		SpecType actual = SpecType.of(product);
		if (requested != null && requested != actual) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_TYPE_IMMUTABLE);
		}
		return actual;
	}

	private Product requireProduct(Long productId) {
		return products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	private Brand brand(Long brandId) {
		return brands.findById(brandId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_BRAND_NOT_FOUND));
	}

	private Category category(Long categoryId) {
		return categories.findById(categoryId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND));
	}

	private DeskTexture deskTexture(Long deskTextureId) {
		return deskTextures.findById(deskTextureId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_DESK_TEXTURE_NOT_FOUND));
	}
}
