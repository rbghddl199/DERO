package com.brunchies.dero.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@link ProductImage}가 {@code product_image} 테이블에 그대로 실리는지 검증한다
 * (2026-07-30 신설, DERO-270).
 *
 * <p>이 클래스가 못 박는 것은 둘이다. ① <b>저장이 {@link Product} 루트를 통과한다</b> —
 * {@code ProductImageRepository}가 금지돼(ADR-0011 결정 8) {@code cascade}가 빠지면 컴파일도
 * {@code ddl-auto: validate}도 통과한 뒤 저장만 조용히 안 된다. ② <b>부분 유니크 인덱스
 * {@code uq_product_image_product_id}({@code WHERE is_primary})가 실제로 작동한다</b> — 대표가 둘이
 * 되면 목록 카드가 어느 것을 쓸지 갈린다.
 */
class ProductImagePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private BrandRepository brandRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	@DisplayName("이미지 왕복 — 루트를 통해 cascade 저장되고 대표 1장 + 비대표 2장이 그대로 읽힌다")
	void 이미지_왕복() {
		Prop prop = 신규_소품();
		prop.addImage(ProductImage.create(prop, "product-images/a.png", 0, true));
		prop.addImage(ProductImage.create(prop, "product-images/b.png", 1, false));
		prop.addImage(ProductImage.create(prop, "product-images/c.png", 2, false));

		Long id = productRepository.save(prop).getId();
		entityManager.flush();
		entityManager.clear();

		List<ProductImage> found = productRepository.findById(id).orElseThrow().getImages();
		assertThat(found).hasSize(3);
		assertThat(found).filteredOn(ProductImage::isPrimary)
				.singleElement()
				.satisfies(image -> {
					assertThat(image.getImageKey()).isEqualTo("product-images/a.png");
					assertThat(image.getDisplayOrder()).isZero();
					assertThat(image.getCreatedAt()).isNotNull();
					assertThat(image.getUpdatedAt()).isNull();
				});
	}

	@Test
	@DisplayName("컬럼명은 image_key·display_order·is_primary 그대로다")
	void 컬럼명_고정() {
		Prop prop = 신규_소품();
		prop.addImage(ProductImage.create(prop, "product-images/d.png", 7, true));

		Long id = productRepository.save(prop).getId();
		entityManager.flush();
		entityManager.clear();

		Object[] row = (Object[]) entityManager.createNativeQuery(
						"SELECT image_key, display_order, is_primary FROM product_image "
								+ "WHERE product_id = :id")
				.setParameter("id", id)
				.getSingleResult();

		assertThat(row[0]).isEqualTo("product-images/d.png");
		assertThat(row[1]).isEqualTo(7);
		assertThat(row[2]).isEqualTo(true);
	}

	@Test
	@DisplayName("같은 제품에 대표 2장을 두면 거부된다 — uq_product_image_product_id WHERE is_primary")
	void 대표_중복_거부() {
		Prop prop = 신규_소품();
		prop.addImage(ProductImage.create(prop, "product-images/e.png", 0, true));
		productRepository.save(prop);
		entityManager.flush();

		prop.addImage(ProductImage.create(prop, "product-images/f.png", 1, true));
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	@Test
	@DisplayName("비대표는 여러 장이 정상이다 — 부분 유니크는 is_primary = true인 행만 본다")
	void 비대표_다수_허용() {
		Prop prop = 신규_소품();
		prop.addImage(ProductImage.create(prop, "product-images/g.png", 0, false));
		prop.addImage(ProductImage.create(prop, "product-images/h.png", 1, false));

		Long id = productRepository.save(prop).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(id).orElseThrow().getImages()).hasSize(2);
	}

	@Test
	@DisplayName("9장째는 거부된다 — 제품당 8장 상한은 행 개수 조건이라 DB가 못 막고 루트가 막는다")
	void 이미지_상한_초과_거부() {
		Prop prop = 신규_소품();
		for (int i = 0; i < Product.MAX_IMAGES; i++) {
			prop.addImage(ProductImage.create(prop, "product-images/limit-" + i + ".png", i, i == 0));
		}

		Long id = productRepository.save(prop).getId();
		entityManager.flush();
		entityManager.clear();

		Product reloaded = productRepository.findById(id).orElseThrow();
		assertThat(reloaded.getImages()).hasSize(Product.MAX_IMAGES);
		assertThatThrownBy(() -> reloaded.addImage(
						ProductImage.create(reloaded, "product-images/limit-8.png", 8, false)))
				.isInstanceOf(BusinessException.class)
				.hasFieldOrPropertyWithValue("errorCode", ProductErrorCode.PRODUCT_IMAGE_LIMIT_EXCEEDED);
	}

	@Test
	@DisplayName("이미지가 0장인 제품이 정상이다 — 자작 제품(source = USER)의 정상 상태다")
	void 이미지_없음() {
		Long id = productRepository.save(신규_소품()).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.findById(id).orElseThrow().getImages()).isEmpty();
	}

	private Prop 신규_소품() {
		Brand brand = brandRepository.save(Brand.create("리안리", null, null, null));
		Category category = categoryRepository.save(Category.createRoot("PC 본체", null, 1));
		return Prop.create(ProductSource.CATALOG, null, brand, category, "O11 다이내믹", null,
				189000, null, 272, 446, 446, 11000, false, MountSurface.FLOOR);
	}
}
