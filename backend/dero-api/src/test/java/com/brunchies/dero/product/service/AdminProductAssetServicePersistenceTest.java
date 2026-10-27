package com.brunchies.dero.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.ErrorCode;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Distribution;
import com.brunchies.dero.product.EmitterShape;
import com.brunchies.dero.product.Finish;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.PanelShape;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.RigManifest;
import com.brunchies.dero.product.dto.AssetRegisterRequest;
import com.brunchies.dero.product.dto.AssetResponse;
import com.brunchies.dero.product.dto.AssetUploadUrlRequest;
import com.brunchies.dero.product.dto.AssetUploadUrlResponse;
import com.brunchies.dero.product.dto.ProductEmitterRequest;
import com.brunchies.dero.product.dto.ProductEmitterResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 에셋 GLB·발광 저작 upsert를 실제 Postgres로 검증한다(api-spec §9, REQ-ADM-01·02).
 *
 * <p>여기가 확인하는 것은 슬라이스 테스트가 못 보는 것들이다 — ① upsert가 <b>같은 행</b>을 갈아
 * 끼우는가({@code product_id}가 PK라 새 행을 만들면 조용히 덮이거나 깨진다) ② erd.md의 WAS 강제
 * 검증표가 저장 경로에서 실제로 도는가 ③ {@code rig_manifest} JSONB가 record 그대로 왕복하는가
 * ④ {@code orphanRemoval}이 발광 행을 진짜 지우는가.
 *
 * <p>{@link PresignPort}는 목이다 — 발급된 URL의 모양은 이 테스트의 관심사가 아니다
 * ({@code ProductImageServicePersistenceTest}와 같은 판단).
 */
class AdminProductAssetServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private AdminProductAssetService adminProductAssetService;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private DeskTextureRepository deskTextureRepository;

	@Autowired
	private EntityManager entityManager;

	@MockitoBean
	private PresignPort presignPort;

	private Long propId;
	private Long deskId;
	private Long monitorId;

	@BeforeEach
	void setUp() {
		Category category = categoryRepository.save(Category.createRoot("PC 본체", null, 1));
		propId = productRepository.save(Prop.create(ProductSource.CATALOG, null, null, category,
				"O11 다이내믹", null, 189_000, null, 272, 446, 446, 11_000, false,
				MountSurface.FLOOR)).getId();

		DeskTexture texture = deskTextureRepository.save(DeskTexture.create("오크", "#C9A876", null,
				null, null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskId = productRepository.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1400 책상", null, 250_000, null, 1400, 700, 720, 25, 30, false, texture,
				FrameType.T_FRAME, null)).getId();

		monitorId = productRepository.save(Monitor.create(ProductSource.CATALOG, null, null, category,
				"U2723QE", null, 700_000, null, new BigDecimal("27.0"), 16, 9, 8, null,
				PanelShape.FLAT, null, 130, true, true, null, null, null, null, 5_000, null)).getId();

		given(presignPort.presignUpload(anyString(), anyString())).willReturn("https://s3/put?sig");
	}

	// --- presign ---

	@Test
	@DisplayName("upload-url은 assets/{productId}/… .glb key와 presigned URL을 돌려준다")
	void 발급() {
		AssetUploadUrlResponse response = adminProductAssetService.presignUpload(
				propId, new AssetUploadUrlRequest("model/gltf-binary"));

		assertThat(response.assetKey())
				.startsWith("assets/" + propId + "/")
				.endsWith(".glb");
		assertThat(response.uploadUrl()).isEqualTo("https://s3/put?sig");
	}

	@Test
	@DisplayName("application/octet-stream도 허용한다 — 브라우저가 File.type을 비워 보낸다")
	void 발급_옥텟스트림() {
		assertThat(adminProductAssetService.presignUpload(
				propId, new AssetUploadUrlRequest("application/octet-stream")).assetKey())
				.endsWith(".glb");
	}

	@Test
	@DisplayName("GLB가 아닌 contentType은 400 PRODUCT_INVALID_ASSET_CONTENT_TYPE이다")
	void 발급_잘못된_타입() {
		assertThatThrownBy(() -> adminProductAssetService.presignUpload(
				propId, new AssetUploadUrlRequest("image/png")))
				.satisfies(코드가(ProductErrorCode.PRODUCT_INVALID_ASSET_CONTENT_TYPE));
	}

	@Test
	@DisplayName("책상에 발급을 요청하면 422 PRODUCT_ASSET_NOT_APPLICABLE이다 — 절차 생성이라 에셋이 없다(D18)")
	void 발급_책상() {
		assertThatThrownBy(() -> adminProductAssetService.presignUpload(
				deskId, new AssetUploadUrlRequest("model/gltf-binary")))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE));
	}

	@Test
	@DisplayName("모니터에 발급을 요청하면 422 PRODUCT_ASSET_NOT_APPLICABLE이다 — 절차 생성이라 에셋이 없다(D18)")
	void 발급_모니터() {
		assertThatThrownBy(() -> adminProductAssetService.presignUpload(
				monitorId, new AssetUploadUrlRequest("model/gltf-binary")))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE));
	}

	@Test
	@DisplayName("없는 제품에 발급을 요청하면 404 PRODUCT_NOT_FOUND다")
	void 발급_제품_없음() {
		assertThatThrownBy(() -> adminProductAssetService.presignUpload(
				999_999_999L, new AssetUploadUrlRequest("model/gltf-binary")))
				.satisfies(코드가(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	// --- 에셋 upsert ---

	@Test
	@DisplayName("TEXTURE 에셋 등록은 즉시 APPROVED + verified_at이다 — 검수 큐는 자작 업로드용이다")
	void 에셋_등록() {
		AssetResponse response = adminProductAssetService.register(propId,
				new AssetRegisterRequest("assets/1/a.glb", GlbExportMode.TEXTURE, null, null, 12_000));

		assertThat(response.productId()).isEqualTo(propId);
		assertThat(response.reviewStatus()).isEqualTo(ReviewStatus.APPROVED);
		assertThat(response.verifiedAt()).isNotNull();

		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(propId).orElseThrow().getAsset().getAssetKey())
				.isEqualTo("assets/1/a.glb");
	}

	@Test
	@DisplayName("재업로드는 같은 행을 갈아끼운다 — TEXTURE → PART_SEGMENTATION + finish 교체")
	void 에셋_교체() {
		adminProductAssetService.register(propId,
				new AssetRegisterRequest("assets/1/a.glb", GlbExportMode.TEXTURE, null, null, 12_000));
		entityManager.flush();

		adminProductAssetService.register(propId, new AssetRegisterRequest("assets/1/b.glb",
				GlbExportMode.PART_SEGMENTATION, Finish.METALLIC, 리그_매니페스트(), 8_000));
		entityManager.flush();
		entityManager.clear();

		Long 행_개수 = (Long) entityManager
				.createNativeQuery("SELECT count(*) FROM asset WHERE product_id = :id")
				.setParameter("id", propId)
				.getSingleResult();
		assertThat(행_개수).isEqualTo(1L);

		var found = productRepository.findById(propId).orElseThrow().getAsset();
		assertThat(found.getAssetKey()).isEqualTo("assets/1/b.glb");
		assertThat(found.getGlbExportMode()).isEqualTo(GlbExportMode.PART_SEGMENTATION);
		assertThat(found.getFinish()).isEqualTo(Finish.METALLIC);
		assertThat(found.getPolygonCount()).isEqualTo(8_000);
		assertThat(found.getRigManifest().supportPart()).isEqualTo("clamp-base");
		assertThat(found.getRigManifest().joints()).singleElement()
				.satisfies(joint -> {
					assertThat(joint.joint()).isEqualTo("elbow-pitch");
					assertThat(joint.label()).isEqualTo("팔꿈치 각도");
					assertThat(joint.maxDeg()).isEqualTo(90.0);
				});
	}

	@Test
	@DisplayName("PART_SEGMENTATION인데 finish가 없으면 422다 — part-seg는 텍스처를 주지 않는다")
	void 에셋_재질_누락() {
		assertThatThrownBy(() -> adminProductAssetService.register(propId, new AssetRegisterRequest(
				"assets/1/a.glb", GlbExportMode.PART_SEGMENTATION, null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_FINISH_REQUIRED));
	}

	@Test
	@DisplayName("TEXTURE인데 finish가 있으면 422다 — 재질 정본이 GLB 안이라 정본이 둘이 된다")
	void 에셋_재질_초과() {
		assertThatThrownBy(() -> adminProductAssetService.register(propId, new AssetRegisterRequest(
				"assets/1/a.glb", GlbExportMode.TEXTURE, Finish.BLACK, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_FINISH_NOT_ALLOWED));
	}

	@Test
	@DisplayName("이미 APPROVED인 에셋을 교체해도 규칙 위반이면 옛 값이 남는다 — 검증이 먼저 돈다")
	void 에셋_교체_실패시_보존() {
		adminProductAssetService.register(propId,
				new AssetRegisterRequest("assets/1/a.glb", GlbExportMode.TEXTURE, null, null, null));
		entityManager.flush();

		assertThatThrownBy(() -> adminProductAssetService.register(propId, new AssetRegisterRequest(
				"assets/1/b.glb", GlbExportMode.PART_SEGMENTATION, null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_FINISH_REQUIRED));

		assertThat(productRepository.findById(propId).orElseThrow().getAsset().getAssetKey())
				.isEqualTo("assets/1/a.glb");
	}

	@Test
	@DisplayName("책상에는 에셋을 등록할 수 없다 — presign만 막고 등록을 열면 존재할 수 없는 행이 생긴다")
	void 에셋_등록_책상() {
		assertThatThrownBy(() -> adminProductAssetService.register(deskId, new AssetRegisterRequest(
				"assets/2/a.glb", GlbExportMode.TEXTURE, null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE));
	}

	@Test
	@DisplayName("모니터에는 에셋을 등록할 수 없다 — 규격값으로 절차 생성한다(D18, 2026-08-02 재개정)")
	void 에셋_등록_모니터() {
		assertThatThrownBy(() -> adminProductAssetService.register(monitorId, new AssetRegisterRequest(
				"assets/3/a.glb", GlbExportMode.TEXTURE, null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE));
	}

	// --- 발광 upsert ---

	@Test
	@DisplayName("POINT 발광 등록 왕복 — distribution·point 3종은 NULL이 정상이다")
	void 발광_등록() {
		ProductEmitterResponse response = adminProductAssetService.registerEmitter(propId,
				new ProductEmitterRequest(EmitterShape.POINT, null, 120, 400, true, "#FF00AA",
						null, null, null));

		assertThat(response.productId()).isEqualTo(propId);
		assertThat(response.distribution()).isNull();

		entityManager.flush();
		entityManager.clear();

		var found = productRepository.findById(propId).orElseThrow().getEmitter();
		assertThat(found.getShape()).isEqualTo(EmitterShape.POINT);
		assertThat(found.getLumens()).isEqualTo(120);
		assertThat(found.getRadiusMm()).isEqualTo(400);
		assertThat(found.isRecolorable()).isTrue();
		assertThat(found.getDefaultColor()).isEqualTo("#FF00AA");
		assertThat(found.getPointXMm()).isNull();
	}

	@Test
	@DisplayName("발광 재등록은 같은 행을 갈아끼운다 — POINT → SPOT + FLOOD + point 3종")
	void 발광_교체() {
		adminProductAssetService.registerEmitter(propId, new ProductEmitterRequest(
				EmitterShape.POINT, null, 120, 400, true, "#FF00AA", null, null, null));
		entityManager.flush();

		adminProductAssetService.registerEmitter(propId, new ProductEmitterRequest(
				EmitterShape.SPOT, Distribution.FLOOD, 800, 1_200, false, "#FFD9A0", 0, 220, -15));
		entityManager.flush();
		entityManager.clear();

		Long 행_개수 = (Long) entityManager
				.createNativeQuery("SELECT count(*) FROM product_emitter WHERE product_id = :id")
				.setParameter("id", propId)
				.getSingleResult();
		assertThat(행_개수).isEqualTo(1L);

		var found = productRepository.findById(propId).orElseThrow().getEmitter();
		assertThat(found.getShape()).isEqualTo(EmitterShape.SPOT);
		assertThat(found.getDistribution()).isEqualTo(Distribution.FLOOD);
		assertThat(found.getLumens()).isEqualTo(800);
		assertThat(found.isRecolorable()).isFalse();
		assertThat(found.getPointXMm()).isZero();
		assertThat(found.getPointYMm()).isEqualTo(220);
		assertThat(found.getPointZMm()).isEqualTo(-15);
	}

	@Test
	@DisplayName("SPOT인데 distribution이 없으면 422다 — 조일 원뿔의 각을 고를 곳이 없다")
	void 발광_배광_누락() {
		assertThatThrownBy(() -> adminProductAssetService.registerEmitter(propId,
				new ProductEmitterRequest(EmitterShape.SPOT, null, 800, 1_200, false, "#FFD9A0",
						null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_EMITTER_DISTRIBUTION_REQUIRED));
	}

	@Test
	@DisplayName("POINT인데 distribution이 있으면 422다 — POINT에는 조일 원뿔이 없다")
	void 발광_배광_초과() {
		assertThatThrownBy(() -> adminProductAssetService.registerEmitter(propId,
				new ProductEmitterRequest(EmitterShape.POINT, Distribution.SPOT, 120, 400, true,
						"#FF00AA", null, null, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_EMITTER_DISTRIBUTION_NOT_ALLOWED));
	}

	@Test
	@DisplayName("point 좌표를 두 축만 넣으면 422다 — 나머지 하나가 조용히 0이 되어 발광점이 제품 밖으로 나간다")
	void 발광_좌표_부분입력() {
		assertThatThrownBy(() -> adminProductAssetService.registerEmitter(propId,
				new ProductEmitterRequest(EmitterShape.POINT, null, 120, 400, true, "#FF00AA",
						0, 220, null)))
				.satisfies(코드가(ProductErrorCode.PRODUCT_EMITTER_POINT_PARTIAL));
	}

	@Test
	@DisplayName("책상에도 발광체를 붙일 수 있다 — 발광은 spec_type과 직교한다")
	void 발광_책상() {
		assertThat(adminProductAssetService.registerEmitter(deskId, new ProductEmitterRequest(
				EmitterShape.POINT, null, 60, 300, true, "#00FFEE", null, null, null))
				.productId()).isEqualTo(deskId);
	}

	// --- 발광 삭제 ---

	/**
	 * <b>{@code clear()}가 필수다</b> — 등록과 삭제를 한 영속성 컨텍스트에서 이어 하면 Hibernate의
	 * 로드 스냅샷에는 {@code emitter = null}이 남아 있어 <b>고아로 인식되지 않고 행이 살아남는다</b>
	 * (2026-07-31 실측). 요청 하나당 영속성 컨텍스트 하나인 실제 흐름에서는 삭제 요청이 제품을 새로
	 * 읽으므로 이 상황이 생기지 않는다 — 그래서 테스트가 그 흐름을 흉내 낸다.
	 */
	@Test
	@DisplayName("발광 삭제는 product_emitter 행을 지운다 — orphanRemoval")
	void 발광_삭제() {
		adminProductAssetService.registerEmitter(propId, new ProductEmitterRequest(
				EmitterShape.POINT, null, 120, 400, true, "#FF00AA", null, null, null));
		entityManager.flush();
		entityManager.clear();

		adminProductAssetService.removeEmitter(propId);
		entityManager.flush();
		entityManager.clear();

		Long 행_개수 = (Long) entityManager
				.createNativeQuery("SELECT count(*) FROM product_emitter WHERE product_id = :id")
				.setParameter("id", propId)
				.getSingleResult();
		assertThat(행_개수).isZero();
		assertThat(productRepository.findById(propId).orElseThrow().getEmitter()).isNull();
	}

	@Test
	@DisplayName("발광체가 없는 제품을 삭제해도 성공한다 — DELETE는 멱등이고 끝 상태가 요청과 같다")
	void 발광_삭제_멱등() {
		adminProductAssetService.removeEmitter(propId);
		entityManager.flush();

		assertThat(productRepository.findById(propId).orElseThrow().getEmitter()).isNull();
	}

	@Test
	@DisplayName("없는 제품의 발광을 삭제하면 404 PRODUCT_NOT_FOUND다")
	void 발광_삭제_제품_없음() {
		assertThatThrownBy(() -> adminProductAssetService.removeEmitter(999_999_999L))
				.satisfies(코드가(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	/** 검증표 분기가 많아 {@code isInstanceOf} + {@code satisfies} 두 줄을 여기 한 번만 쓴다. */
	private static Consumer<Throwable> 코드가(ErrorCode expected) {
		return ex -> {
			assertThat(ex).isInstanceOf(BusinessException.class);
			assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(expected);
		};
	}

	/** {@link Product}가 아니라 GLB 파트 이름에 묶인 값이라 재export하면 같이 바뀐다(ADR-0002). */
	private static RigManifest 리그_매니페스트() {
		return new RigManifest(
				Map.of("clamp-base", List.of("mesh_1"), "forearm", List.of("mesh_2")),
				List.of(new RigManifest.Joint("elbow-pitch", "팔꿈치 각도", "clamp-base", "forearm",
						List.of(1.0, 0.0, 0.0), List.of(0.0, 0.12, 0.0), "revolute",
						-30.0, 90.0, null, null, null)),
				"clamp-base",
				"forearm");
	}
}
