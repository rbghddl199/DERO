package com.brunchies.dero.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.TextureMapKind;
import com.brunchies.dero.catalog.dto.BrandCreateRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlResponse;
import com.brunchies.dero.catalog.dto.BrandPatchRequest;
import com.brunchies.dero.catalog.dto.BrandResponse;
import com.brunchies.dero.catalog.dto.CategoryCreateRequest;
import com.brunchies.dero.catalog.dto.CategoryPatchRequest;
import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.dto.DeskTextureCreateRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlResponse;
import com.brunchies.dero.catalog.dto.DeskTexturePatchRequest;
import com.brunchies.dero.catalog.dto.DeskTextureResponse;
import com.brunchies.dero.catalog.dto.HashtagCreateRequest;
import com.brunchies.dero.catalog.dto.HashtagPatchRequest;
import com.brunchies.dero.catalog.dto.HashtagResponse;
import com.brunchies.dero.catalog.dto.VesaSpecCreateRequest;
import com.brunchies.dero.catalog.dto.VesaSpecPatchRequest;
import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.catalog.dto.VibeCreateRequest;
import com.brunchies.dero.catalog.dto.VibePatchRequest;
import com.brunchies.dero.catalog.dto.VibeResponse;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 마스터 6종 관리자 CRUD를 실제 Postgres로 검증한다(api-spec §9 확장).
 *
 * <p>여기가 확인하는 것은 슬라이스 테스트가 못 보는 것들이다 — <b>부분 유니크 인덱스와 코드의
 * {@code exists} 조건이 같은가</b>, 소프트 삭제가 목록에서 실제로 빠지는가, 삭제 게이트가
 * {@code catalog → product} 역류 없이({@code CatalogMasterUsage} 구현 경유) 실제 제품 행을 보는가.
 */
class CatalogAdminServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private AdminBrandService adminBrandService;

	@Autowired
	private AdminCategoryService adminCategoryService;

	@Autowired
	private AdminVibeService adminVibeService;

	@Autowired
	private AdminHashtagService adminHashtagService;

	@Autowired
	private AdminVesaSpecService adminVesaSpecService;

	@Autowired
	private AdminDeskTextureService adminDeskTextureService;

	@Autowired
	private BrandRepository brandRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EntityManager entityManager;

	// --- 마스터별 왕복: 생성 → 수정 → 소프트 삭제 → 목록 제외 ---

	@Test
	@DisplayName("brand 왕복 — 등록·수정 후 소프트 삭제하면 목록에서 빠진다")
	void 브랜드_왕복() {
		BrandResponse created = adminBrandService.create(
				new BrandCreateRequest("데스커", "책상 브랜드", "https://desker.co.kr"));
		assertThat(created.logoImageKey()).isNull();

		BrandResponse updated = adminBrandService.update(created.id(),
				new BrandPatchRequest("데스커코리아", null, null, "brand-logos/1/logo.webp"));
		assertThat(updated.name()).isEqualTo("데스커코리아");
		assertThat(updated.description()).isEqualTo("책상 브랜드");
		assertThat(updated.logoImageKey()).isEqualTo("brand-logos/1/logo.webp");
		assertThat(adminBrandService.list(0, 20).content())
				.extracting(BrandResponse::id).contains(created.id());

		adminBrandService.delete(created.id());
		entityManager.flush();

		assertThat(adminBrandService.list(0, 20).content())
				.extracting(BrandResponse::id).doesNotContain(created.id());
		assertThat(brandRepository.findById(created.id()).orElseThrow().isDeleted()).isTrue();
	}

	@Test
	@DisplayName("category 왕복 — 루트·자식을 만들고 자식을 지우면 목록에서 빠진다")
	void 카테고리_왕복() {
		CategoryResponse root = adminCategoryService.create(
				new CategoryCreateRequest(null, "모니터", "화면 장치", 1));
		assertThat(root.parentId()).isNull();

		CategoryResponse child = adminCategoryService.create(
				new CategoryCreateRequest(root.id(), "27인치", null, null));
		assertThat(child.parentId()).isEqualTo(root.id());
		assertThat(child.displayOrder()).isZero();

		CategoryResponse updated = adminCategoryService.update(child.id(),
				new CategoryPatchRequest(null, "27인치 모니터", null, 5));
		assertThat(updated.name()).isEqualTo("27인치 모니터");
		assertThat(updated.displayOrder()).isEqualTo(5);
		assertThat(updated.parentId()).isEqualTo(root.id());

		adminCategoryService.delete(child.id());
		entityManager.flush();

		assertThat(adminCategoryService.list(0, 20).content())
				.extracting(CategoryResponse::id)
				.contains(root.id())
				.doesNotContain(child.id());
	}

	@Test
	@DisplayName("vibe 왕복 — 등록·수정 후 소프트 삭제하면 목록에서 빠진다")
	void 분위기_왕복() {
		VibeResponse created = adminVibeService.create(new VibeCreateRequest("미니멀"));

		VibeResponse updated = adminVibeService.update(created.id(), new VibePatchRequest("미니멀리즘"));
		assertThat(updated.name()).isEqualTo("미니멀리즘");

		adminVibeService.delete(created.id());
		entityManager.flush();

		assertThat(adminVibeService.list(0, 20).content())
				.extracting(VibeResponse::id).doesNotContain(created.id());
	}

	@Test
	@DisplayName("hashtag 왕복 — 수정에서 NULL은 '안 바꾼다'라 description이 남는다")
	void 해시태그_왕복() {
		HashtagResponse created = adminHashtagService.create(
				new HashtagCreateRequest("화이트톤", "밝은 색 위주 세팅"));

		HashtagResponse updated = adminHashtagService.update(created.id(),
				new HashtagPatchRequest("화이트", null));
		assertThat(updated.name()).isEqualTo("화이트");
		assertThat(updated.description()).isEqualTo("밝은 색 위주 세팅");

		adminHashtagService.delete(created.id());
		entityManager.flush();

		assertThat(adminHashtagService.list(0, 20).content())
				.extracting(HashtagResponse::id).doesNotContain(created.id());
	}

	@Test
	@DisplayName("vesa_spec 왕복 — 홀 간격만 고쳐도 중복 검사를 다시 탄다")
	void 베사_왕복() {
		VesaSpecResponse created = adminVesaSpecService.create(new VesaSpecCreateRequest(100, 100));

		VesaSpecResponse updated = adminVesaSpecService.update(created.id(),
				new VesaSpecPatchRequest(null, 200));
		assertThat(updated.widthMm()).isEqualTo(100);
		assertThat(updated.heightMm()).isEqualTo(200);

		adminVesaSpecService.delete(created.id());
		entityManager.flush();

		assertThat(adminVesaSpecService.list(0, 20).content())
				.extracting(VesaSpecResponse::id).doesNotContain(created.id());
	}

	@Test
	@DisplayName("desk_texture 왕복 — 등록 직후엔 맵 key가 NULL이고 PATCH로 채운다")
	void 상판재질_왕복() {
		DeskTextureResponse created = adminDeskTextureService.create(new DeskTextureCreateRequest(
				"월넛", "#6B4A2F", new BigDecimal("0.65"), new BigDecimal("0.00"), 551, 1));
		assertThat(created.albedoKey()).isNull();
		assertThat(created.roughness()).isEqualByComparingTo("0.65");

		DeskTextureResponse updated = adminDeskTextureService.update(created.id(),
				new DeskTexturePatchRequest(null, null, "desk-textures/1/albedo-x.ktx2", null, null,
						null, null, null, null));
		assertThat(updated.albedoKey()).isEqualTo("desk-textures/1/albedo-x.ktx2");
		assertThat(updated.roughnessKey()).isNull();
		assertThat(updated.tileSizeMm()).isEqualTo(551);

		adminDeskTextureService.delete(created.id());
		entityManager.flush();

		assertThat(adminDeskTextureService.list(0, 20).content())
				.extracting(DeskTextureResponse::id).doesNotContain(created.id());
	}

	// --- 중복·삭제 게이트 ---

	@Test
	@DisplayName("같은 이름 브랜드를 다시 등록하면 409다 (부분 유니크 인덱스와 같은 조건)")
	void 브랜드_이름_중복() {
		adminBrandService.create(new BrandCreateRequest("데스커", null, null));

		assertThatThrownBy(() -> adminBrandService.create(new BrandCreateRequest("데스커", null, null)))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_BRAND_NAME_DUPLICATED);
	}

	@Test
	@DisplayName("소프트 삭제한 이름은 다시 쓸 수 있다 — 유니크 조건에 deleted_at IS NULL이 붙어 있다")
	void 브랜드_삭제후_같은_이름_재등록() {
		BrandResponse created = adminBrandService.create(new BrandCreateRequest("데스커", null, null));
		adminBrandService.delete(created.id());
		entityManager.flush();

		BrandResponse recreated = adminBrandService.create(new BrandCreateRequest("데스커", null, null));
		assertThat(recreated.id()).isNotEqualTo(created.id());
	}

	@Test
	@DisplayName("같은 홀 간격 쌍을 다시 등록하면 409다 (vesa_spec은 이름이 아니라 쌍이 유니크)")
	void 베사_중복() {
		adminVesaSpecService.create(new VesaSpecCreateRequest(100, 100));

		assertThatThrownBy(() -> adminVesaSpecService.create(new VesaSpecCreateRequest(100, 100)))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_VESA_SPEC_DUPLICATED);
	}

	@Test
	@DisplayName("제품이 참조 중인 브랜드·카테고리는 삭제할 수 없다 (409)")
	void 참조중_마스터_삭제_거부() {
		Brand brand = brandRepository.save(Brand.create("델", null, null, null));
		Category category = categoryRepository.save(Category.createRoot("소품", null, 1));
		productRepository.save(Prop.create(ProductSource.CATALOG, null, brand, category,
				"모니터 받침", null, 30000, "https://example.com/p",
				300, 200, 100, 1500, false, MountSurface.TOP));
		entityManager.flush();

		assertThatThrownBy(() -> adminBrandService.delete(brand.getId()))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_BRAND_IN_USE);

		assertThatThrownBy(() -> adminCategoryService.delete(category.getId()))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_CATEGORY_IN_USE);
	}

	@Test
	@DisplayName("자식이 남아 있는 카테고리는 삭제할 수 없다 (409)")
	void 자식있는_카테고리_삭제_거부() {
		CategoryResponse root = adminCategoryService.create(
				new CategoryCreateRequest(null, "모니터", null, 1));
		adminCategoryService.create(new CategoryCreateRequest(root.id(), "27인치", null, 1));
		entityManager.flush();

		assertThatThrownBy(() -> adminCategoryService.delete(root.id()))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_CATEGORY_HAS_CHILDREN);
	}

	@Test
	@DisplayName("자기 자신·하위 카테고리를 상위로 지정하면 422다 (사이클 금지)")
	void 카테고리_부모_사이클_거부() {
		CategoryResponse root = adminCategoryService.create(
				new CategoryCreateRequest(null, "모니터", null, 1));
		CategoryResponse child = adminCategoryService.create(
				new CategoryCreateRequest(root.id(), "27인치", null, 1));

		assertThatThrownBy(() -> adminCategoryService.update(root.id(),
				new CategoryPatchRequest(root.id(), null, null, null)))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_CATEGORY_PARENT_INVALID);

		assertThatThrownBy(() -> adminCategoryService.update(root.id(),
				new CategoryPatchRequest(child.id(), null, null, null)))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_CATEGORY_PARENT_INVALID);
	}

	// --- presign key 규약 ---

	@Test
	@DisplayName("브랜드 로고 presign key는 brand-logos/{id}/{uuid}{확장자}다")
	void 브랜드_로고_presign() {
		BrandResponse created = adminBrandService.create(new BrandCreateRequest("데스커", null, null));
		entityManager.flush();

		BrandLogoUploadUrlResponse response = adminBrandService.presignLogoUpload(created.id(),
				new BrandLogoUploadUrlRequest("logo.webp", "image/webp"));

		assertThat(response.logoKey())
				.startsWith("brand-logos/" + created.id() + "/")
				.endsWith(".webp");
		assertThat(response.uploadUrl()).isNotBlank();
	}

	@Test
	@DisplayName("이미지가 아닌 contentType으로 로고 presign을 요청하면 400이다")
	void 브랜드_로고_presign_컨텐츠타입_거부() {
		BrandResponse created = adminBrandService.create(new BrandCreateRequest("데스커", null, null));
		entityManager.flush();

		assertThatThrownBy(() -> adminBrandService.presignLogoUpload(created.id(),
				new BrandLogoUploadUrlRequest("logo.exe", "application/octet-stream")))
				.isInstanceOf(BusinessException.class)
				.extracting(exception -> ((BusinessException) exception).getErrorCode())
				.isEqualTo(CatalogErrorCode.CATALOG_INVALID_IMAGE_CONTENT_TYPE);
	}

	@Test
	@DisplayName("상판 재질 맵 presign은 요청한 종류만 desk-textures/{id}/{kind}-{uuid}.ktx2로 발급한다")
	void 상판재질_맵_presign() {
		DeskTextureResponse created = adminDeskTextureService.create(new DeskTextureCreateRequest(
				"월넛", "#6B4A2F", new BigDecimal("0.65"), new BigDecimal("0.00"), 551, 1));
		entityManager.flush();

		DeskTextureMapUploadUrlResponse response = adminDeskTextureService.presignMapUploads(
				created.id(),
				new DeskTextureMapUploadUrlRequest(
						Set.of(TextureMapKind.ALBEDO, TextureMapKind.NORMAL)));

		assertThat(response.maps()).hasSize(2)
				.allSatisfy(map -> {
					assertThat(map.key())
							.startsWith("desk-textures/" + created.id() + "/" + map.kind().keyName() + "-")
							.endsWith(".ktx2");
					assertThat(map.uploadUrl()).isNotBlank();
				})
				.extracting(DeskTextureMapUploadUrlResponse.MapUploadUrl::kind)
				.containsExactlyInAnyOrder(TextureMapKind.ALBEDO, TextureMapKind.NORMAL);
	}
}
