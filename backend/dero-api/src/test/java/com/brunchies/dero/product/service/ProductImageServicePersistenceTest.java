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
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.dto.ProductImageCreateRequest;
import com.brunchies.dero.product.dto.ProductImageResponse;
import com.brunchies.dero.product.dto.ProductImageUploadUrlRequest;
import com.brunchies.dero.product.dto.ProductImageUploadUrlResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 제품 이미지 2단계 presign 업로드를 실제 Postgres로 검증한다.
 *
 * <p>{@link PresignPort}는 목이다 — 발급된 URL의 모양은 이 테스트의 관심사가 아니고, 목으로
 * 두면 {@code app.storage.mode}가 바뀌어도(local↔s3) 이 테스트가 흔들리지 않는다.
 */
class ProductImageServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private ProductImageService productImageService;

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

	private Category category;

	private DeskTexture texture;

	private Long productId;

	@BeforeEach
	void setUp() {
		category = categoryRepository.save(Category.createRoot("책상", null, 1));
		texture = deskTextureRepository.save(DeskTexture.create("오크", "#C9A876", null, null,
				null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		productId = productRepository.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1400 책상", null, 250_000, null, 1400, 700, 720, 25, 30, false, texture,
				FrameType.T_FRAME, null)).getId();

		given(presignPort.presignUpload(anyString(), anyString())).willReturn("https://s3/put?sig");
	}

	@Test
	@DisplayName("upload-urls는 제품 id가 접두에 든 key와 presigned URL을 돌려준다")
	void 발급() {
		ProductImageUploadUrlResponse response = productImageService.presignUpload(
				productId, new ProductImageUploadUrlRequest("shot.webp", "image/webp"));

		assertThat(response.imageKey())
				.startsWith("product-images/" + productId + "/")
				.endsWith(".webp");
		assertThat(response.uploadUrl()).isEqualTo("https://s3/put?sig");
	}

	@Test
	@DisplayName("이미지가 아닌 contentType은 400 INVALID_IMAGE_CONTENT_TYPE이다")
	void 발급_잘못된_타입() {
		assertThatThrownBy(() -> productImageService.presignUpload(
				productId, new ProductImageUploadUrlRequest("a.pdf", "application/pdf")))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_INVALID_IMAGE_CONTENT_TYPE));
	}

	@Test
	@DisplayName("없는 제품에 발급을 요청하면 404 PRODUCT_NOT_FOUND다")
	void 발급_제품_없음() {
		assertThatThrownBy(() -> productImageService.presignUpload(
				999_999_999L, new ProductImageUploadUrlRequest("a.webp", "image/webp")))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	@Test
	@DisplayName("key 등록은 product_image 행을 만들고 채번된 id를 돌려준다")
	void 등록() {
		ProductImageResponse response = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, true));

		assertThat(response.id()).isNotNull();

		entityManager.flush();
		entityManager.clear();

		Product saved = productRepository.findById(productId).orElseThrow();
		assertThat(saved.getImages()).hasSize(1);
		assertThat(saved.getImages().get(0).getImageKey()).isEqualTo("product-images/1/a.webp");
		assertThat(saved.getImages().get(0).isPrimary()).isTrue();
	}

	@Test
	@DisplayName("없는 제품에 key를 등록하면 404 PRODUCT_NOT_FOUND다")
	void 등록_제품_없음() {
		assertThatThrownBy(() -> productImageService.register(
				999_999_999L, new ProductImageCreateRequest("product-images/1/a.webp", 0, false)))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	/**
	 * 대표 교체가 부분 유니크 인덱스({@code uq_product_image_product_id WHERE is_primary})를 넘는지가
	 * 이 테스트의 전부다 — 해제 UPDATE를 먼저 내보내지 않으면 여기서 유니크 위반으로 죽는다.
	 */
	@Test
	@DisplayName("대표 지정은 기존 대표를 해제하고 새 이미지를 대표로 세운다")
	void 대표_교체() {
		Long 옛_대표 = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, true)).id();
		Long 새_대표 = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/b.webp", 1, false)).id();

		productImageService.designatePrimary(productId, 새_대표);
		entityManager.flush();
		entityManager.clear();

		Product saved = productRepository.findById(productId).orElseThrow();
		assertThat(saved.findImage(옛_대표).isPrimary()).isFalse();
		assertThat(saved.findImage(새_대표).isPrimary()).isTrue();
	}

	@Test
	@DisplayName("대표가 없던 제품도 지정된다 — 해제할 대상이 없어도 같은 경로다")
	void 대표_최초_지정() {
		Long imageId = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, false)).id();

		productImageService.designatePrimary(productId, imageId);
		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(productId).orElseThrow().findImage(imageId).isPrimary())
				.isTrue();
	}

	@Test
	@DisplayName("이미 대표인 이미지를 다시 지정해도 성공한다 — PUT은 멱등이다")
	void 대표_멱등() {
		Long imageId = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, true)).id();

		productImageService.designatePrimary(productId, imageId);
		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(productId).orElseThrow().findImage(imageId).isPrimary())
				.isTrue();
	}

	@Test
	@DisplayName("그 제품의 이미지가 아니면 404 PRODUCT_IMAGE_NOT_FOUND다")
	void 대표_이미지_없음() {
		assertThatThrownBy(() -> productImageService.designatePrimary(productId, 999_999_999L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_IMAGE_NOT_FOUND));
	}

	@Test
	@DisplayName("없는 제품에 대표를 지정하면 404 PRODUCT_NOT_FOUND다")
	void 대표_제품_없음() {
		assertThatThrownBy(() -> productImageService.designatePrimary(999_999_999L, 1L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	/**
	 * 삭제 전에 {@code clear()}를 넣는다 — 등록과 삭제가 한 영속성 컨텍스트에 있으면 로드 스냅샷과
	 * 실제 흐름이 어긋난다(요청 하나당 컨텍스트 하나인 실제 경로를 흉내 낸다).
	 */
	@Test
	@DisplayName("삭제하면 product_image 행이 사라지고 목록에서 빠진다")
	void 삭제() {
		Long 남길_것 = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, false)).id();
		Long 지울_것 = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/b.webp", 1, false)).id();
		entityManager.flush();
		entityManager.clear();

		productImageService.delete(productId, 지울_것);
		entityManager.flush();
		entityManager.clear();

		Product saved = productRepository.findById(productId).orElseThrow();
		assertThat(saved.getImages()).hasSize(1);
		assertThat(saved.getImages().get(0).getId()).isEqualTo(남길_것);
	}

	@Test
	@DisplayName("대표 이미지도 삭제된다 — 대표 0장 상태를 허용한다")
	void 삭제_대표() {
		Long 대표 = productImageService.register(
				productId, new ProductImageCreateRequest("product-images/1/a.webp", 0, true)).id();
		entityManager.flush();
		entityManager.clear();

		productImageService.delete(productId, 대표);
		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(productId).orElseThrow().getImages()).isEmpty();
	}

	/** 남의 제품 이미지 id로는 못 지운다 — 실재하는 id라도 이 제품 것이 아니면 404다. */
	@Test
	@DisplayName("다른 제품의 이미지 id로 삭제하면 404 PRODUCT_IMAGE_NOT_FOUND다")
	void 삭제_남의_이미지() {
		Long 남의_제품 = productRepository.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1600 책상", null, 300_000, null, 1600, 700, 720, 25, 30, false, texture,
				FrameType.T_FRAME, null)).getId();
		Long 남의_이미지 = productImageService.register(
				남의_제품, new ProductImageCreateRequest("product-images/2/a.webp", 0, false)).id();
		entityManager.flush();
		entityManager.clear();

		assertThatThrownBy(() -> productImageService.delete(productId, 남의_이미지))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_IMAGE_NOT_FOUND));
	}

	@Test
	@DisplayName("없는 제품의 이미지를 삭제하면 404 PRODUCT_NOT_FOUND다")
	void 삭제_제품_없음() {
		assertThatThrownBy(() -> productImageService.delete(999_999_999L, 1L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_NOT_FOUND));
	}
}
