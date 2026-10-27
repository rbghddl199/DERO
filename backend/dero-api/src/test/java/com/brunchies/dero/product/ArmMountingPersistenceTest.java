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
 * {@link ArmMounting}이 {@code arm} 테이블의 기존 3컬럼에 그대로 실리는지 검증한다.
 *
 * <p>이 클래스의 존재 이유는 <b>record 컴포넌트에 붙인 {@code @Column}이 실제로 매핑에 반영되는지</b>가
 * 미검증이었기 때문이다(Hibernate 7.4.1). 반영되지 않으면 Hibernate가 컴포넌트 이름
 * ({@code clamp}·{@code grommet}·{@code wall})을 컬럼명으로 추정하고, 그 컬럼은 존재하지 않아
 * {@code ddl-auto: validate}가 컨텍스트 기동 단계에서 죽는다 — <b>즉 이 테스트가 뜨는 것 자체가 1차
 * 판정</b>이다. 아래 네이티브 쿼리는 컬럼명까지 못 박는 2차 판정이다.
 */
class ArmMountingPersistenceTest extends AbstractPostgresIntegrationTest {

  @Autowired
  private ProductRepository productRepository;

  @Autowired
  private BrandRepository brandRepository;

  @Autowired
  private CategoryRepository categoryRepository;

  @Autowired
  private EntityManager entityManager;

  @Test
  @DisplayName("ArmMounting 왕복 — 값 객체로 묶어도 arm의 기존 3컬럼에 그대로 저장된다")
  void 마운팅_왕복() {
    Long id = productRepository.save(신규_암(new ArmMounting(true, true, false))).getId();
    entityManager.flush();
    entityManager.clear();

    Arm found = (Arm) productRepository.findById(id).orElseThrow();
    assertThat(found.getMounting().clamp()).isTrue();
    assertThat(found.getMounting().grommet()).isTrue();
    assertThat(found.getMounting().wall()).isFalse();
  }

  @Test
  @DisplayName("record 컴포넌트의 @Column이 먹는다 — 컬럼명은 is_clamp_mountable 3종 그대로다")
  void 컬럼명_고정() {
    Long id = productRepository.save(신규_암(new ArmMounting(false, true, true))).getId();
    entityManager.flush();
    entityManager.clear();

    Object[] row = (Object[]) entityManager.createNativeQuery(
            "SELECT is_clamp_mountable, is_grommet_mountable, is_wall_mountable "
                + "FROM arm WHERE product_id = :id")
        .setParameter("id", id)
        .getSingleResult();

    assertThat(row[0]).isEqualTo(false);
    assertThat(row[1]).isEqualTo(true);
    assertThat(row[2]).isEqualTo(true);
  }

  @Test
  @DisplayName("셋 다 false인 스탠드형도 저장된다 — 값 객체가 NULL로 뭉개지지 않는다")
  void 전부_false() {
    Long id = productRepository.save(신규_암(new ArmMounting(false, false, false))).getId();
    entityManager.flush();
    entityManager.clear();

    Arm found = (Arm) productRepository.findById(id).orElseThrow();
    assertThat(found.getMounting()).isNotNull();
    assertThat(found.getMounting().clamp()).isFalse();
    assertThat(found.getMounting().grommet()).isFalse();
    assertThat(found.getMounting().wall()).isFalse();
  }

  private Arm 신규_암(ArmMounting mounting) {
    Brand brand = brandRepository.save(Brand.create("에르고트론", null, null, null));
    Category category = categoryRepository.save(Category.createRoot("모니터암", null, 1));
    return Arm.create(ProductSource.CATALOG, null, brand, category, "LX 데스크 마운트", null,
        329000, null, ArmKind.MONITOR, ArmType.ARTICULATED, 1, 2, null, 100, 640, 0,
        330, mounting, 10, 60, -5, 70, 360, 360, true, true, 11300);
  }
}
