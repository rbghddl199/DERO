package com.brunchies.dero.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@link ProductEmitter}가 {@code product_emitter} 테이블에 그대로 실리는지 검증한다
 * (2026-07-29 신설, DERO-222 → 251).
 *
 * <p>이 클래스의 존재 이유는 <b>발광 저작값의 부모가 {@link Asset}이 아니라 {@link Product}로 바뀐 것</b>이
 * 저장 경로까지 실제로 성립하는지가 미검증이었기 때문이다. {@code ProductEmitterRepository}가 금지돼
 * (ADR-0007) 저장이 루트를 통과해야 하는데, {@code cascade}가 빠지면 컴파일도 통과하고
 * {@code ddl-auto: validate}도 통과한 뒤 <b>저장만 조용히 안 된다</b>.
 *
 * <p>{@code spec_type}과 직교한다는 성질도 여기서 못 박는다 — 조명이 아닌 {@link Prop}(PC 본체 RGB)에
 * 발광체를 붙인다.
 */
class ProductEmitterPersistenceTest extends AbstractPostgresIntegrationTest {

  @Autowired
  private ProductRepository productRepository;

  @Autowired
  private BrandRepository brandRepository;

  @Autowired
  private CategoryRepository categoryRepository;

  @Autowired
  private EntityManager entityManager;

  @Test
  @DisplayName("POINT 왕복 — 조명이 아닌 제품(PROP)도 발광체를 갖는다. point 3종은 NULL이 정상이다")
  void 발광체_왕복() {
    Prop prop = 신규_소품();
    prop.attachEmitter(ProductEmitter.create(prop, EmitterShape.POINT, null, 120, 400, true,
        "#FF00AA", null, null, null));

    Long id = productRepository.save(prop).getId();
    entityManager.flush();
    entityManager.clear();

    ProductEmitter found = productRepository.findById(id).orElseThrow().getEmitter();
    assertThat(found).isNotNull();
    assertThat(found.getProductId()).isEqualTo(id);
    assertThat(found.getShape()).isEqualTo(EmitterShape.POINT);
    assertThat(found.getDistribution()).isNull();
    assertThat(found.getLumens()).isEqualTo(120);
    assertThat(found.getRadiusMm()).isEqualTo(400);
    assertThat(found.isRecolorable()).isTrue();
    assertThat(found.getDefaultColor()).isEqualTo("#FF00AA");
    assertThat(found.getPointXMm()).isNull();
    assertThat(found.getPointYMm()).isNull();
    assertThat(found.getPointZMm()).isNull();
  }

  @Test
  @DisplayName("SPOT + point 3종 — 컬럼명은 point_x_mm 3종과 default_color 그대로다")
  void 컬럼명_고정() {
    Prop prop = 신규_소품();
    prop.attachEmitter(ProductEmitter.create(prop, EmitterShape.SPOT, Distribution.FLOOD, 800,
        1200, false, "#FFD9A0", 0, 220, -15));

    Long id = productRepository.save(prop).getId();
    entityManager.flush();
    entityManager.clear();

    Object[] row = (Object[]) entityManager.createNativeQuery(
            "SELECT shape, distribution, lumens, radius_mm, recolorable, default_color, "
                + "point_x_mm, point_y_mm, point_z_mm FROM product_emitter WHERE product_id = :id")
        .setParameter("id", id)
        .getSingleResult();

    assertThat(row[0]).isEqualTo("SPOT");
    assertThat(row[1]).isEqualTo("FLOOD");
    assertThat(row[2]).isEqualTo(800);
    assertThat(row[3]).isEqualTo(1200);
    assertThat(row[4]).isEqualTo(false);
    assertThat(row[5]).isEqualTo("#FFD9A0");
    assertThat(row[6]).isEqualTo(0);
    assertThat(row[7]).isEqualTo(220);
    assertThat(row[8]).isEqualTo(-15);
  }

  @Test
  @DisplayName("발광체 없는 제품은 행이 없다 — 관계가 nullable이다")
  void 발광체_없음() {
    Long id = productRepository.save(신규_소품()).getId();
    entityManager.flush();
    entityManager.clear();

    assertThat(productRepository.findById(id).orElseThrow().getEmitter()).isNull();
  }

  @Test
  @DisplayName("light의 광학 6컬럼은 NULL로 저장된다 — 카탈로그 표기 마커라 결측을 허용한다")
  void 조명_광학_결측() {
    Brand brand = brandRepository.save(Brand.create("이케아", null, null, null));
    Category category = categoryRepository.save(Category.createRoot("조명", null, 2));
    Light light = Light.create(ProductSource.CATALOG, null, brand, category, "포뇌스", null,
        29900, null, 120, 120, 400, false, null, null, false, null, null, null, null);

    Long id = productRepository.save(light).getId();
    entityManager.flush();
    entityManager.clear();

    Light found = (Light) productRepository.findById(id).orElseThrow();
    assertThat(found.getColorTemperatureMinK()).isNull();
    assertThat(found.getColorTemperatureMaxK()).isNull();
    assertThat(found.getLuminousFluxMinLm()).isNull();
    assertThat(found.getLuminousFluxMaxLm()).isNull();
    assertThat(found.getDistribution()).isNull();
    assertThat(found.getReachMm()).isNull();
    assertThat(found.getWidthMm()).isEqualTo(120);
  }

  private Prop 신규_소품() {
    Brand brand = brandRepository.save(Brand.create("리안리", null, null, null));
    Category category = categoryRepository.save(Category.createRoot("PC 본체", null, 1));
    return Prop.create(ProductSource.CATALOG, null, brand, category, "O11 다이내믹", null,
        189000, null, 272, 446, 446, 11000, false, MountSurface.FLOOR);
  }
}
