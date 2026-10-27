package com.brunchies.dero.product;

import static com.brunchies.dero.product.QProduct.product;
import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.product.repository.ProductRepository;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import org.hibernate.Hibernate;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * QueryDSL 배선이 <b>Hibernate 7.4 런타임에서 실제로 도는지</b> 검증한다(ADR-0018 결정 2의 코드 티켓).
 *
 * <p>ADR-0006 맥락 절이 "Hibernate 7.4 GA 위에서 검증된 QueryDSL 빌드가 존재하지 않는다"고 적었고
 * ADR-0018이 그 확인을 이 티켓의 첫 작업으로 지정했다. <b>컴파일 성공은 검증이 아니다</b> — Q클래스
 * 생성은 apt가 하고 JPQL 조립은 순수 자바지만, 그 JPQL을 SQL로 번역하는 것은 Hibernate다. 그래서
 * 진짜 Postgres 위에서 쿼리를 실행해 결과와 발행 statement 수까지 본다.
 *
 * <p>{@code generate_statistics}를 이 클래스에서만 켠다 — {@code left join fetch}가 실제로 붙었는지는
 * <b>결과 값으로는 판정할 수 없다</b>. 역방향 nullable 1:1은 프록시가 안 만들어져 fetch join이 없어도
 * 결국 값이 채워지고(추가 SELECT로), 그래서 {@code asset != null}은 두 경우 모두 참이다. 구분되는
 * 것은 발행된 SQL 개수뿐이다.
 */
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class ProductQuerydslPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private JPAQueryFactory queryFactory;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private DeskTextureRepository deskTextureRepository;

	@Autowired
	private EntityManager entityManager;

	private Long propId;
	private Long deskId;
	private Category 카테고리;

	@BeforeEach
	void setUp() {
		Category category = categoryRepository.save(Category.createRoot("PC 본체", null, 1));
		카테고리 = category;

		Prop prop = Prop.create(ProductSource.CATALOG, null, null, category, "O11 다이내믹", null,
				189_000, null, 272, 446, 446, 11_000, false, MountSurface.FLOOR);
		prop.registerAsset("assets/o11.glb", GlbExportMode.TEXTURE, null, 12_000, null);
		prop.registerEmitter(EmitterShape.POINT, null, 120, 400, true, "#FF00AA", null, null, null);
		propId = productRepository.save(prop).getId();

		DeskTexture texture = deskTextureRepository.save(DeskTexture.create("오크", "#C9A876", null,
				null, null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deskId = productRepository.save(Desk.create(ProductSource.CATALOG, null, null, category,
				"1400 책상", null, 250_000, null, 1400, 700, 720, 25, 30, false, texture,
				FrameType.T_FRAME, null)).getId();

		entityManager.flush();
		entityManager.clear();
	}

	@Test
	@DisplayName("Q클래스 + JPAQueryFactory로 엔티티를 조회한다 — 동적 조건은 null이면 통째로 빠진다")
	void 동적_조건_조회() {
		List<Product> 전체 = queryFactory.selectFrom(product)
				.where(product.deletedAt.isNull(), 이름이(null))
				.orderBy(product.id.asc())
				.fetch();

		List<Product> 이름_필터 = queryFactory.selectFrom(product)
				.where(product.deletedAt.isNull(), 이름이("O11 다이내믹"))
				.fetch();

		assertThat(전체).extracting(Product::getId).containsExactly(propId, deskId);
		assertThat(이름_필터).extracting(Product::getId).containsExactly(propId);
	}

	@Test
	@DisplayName("역방향 nullable 1:1(asset·emitter)의 left join fetch가 SQL 한 방으로 나간다")
	void 역방향_1대1_페치조인() {
		Statistics 통계 = 통계();
		통계.clear();

		Product 조회 = queryFactory.selectFrom(product)
				.leftJoin(product.asset).fetchJoin()
				.leftJoin(product.emitter).fetchJoin()
				.where(product.id.eq(propId))
				.fetchOne();

		assertThat(조회).isNotNull();
		assertThat(조회.getAsset().getAssetKey()).isEqualTo("assets/o11.glb");
		assertThat(조회.getEmitter().getShape()).isEqualTo(EmitterShape.POINT);
		assertThat(통계.getPrepareStatementCount())
				.as("fetch join이 안 붙으면 asset·emitter 확인 쿼리가 따로 나가 3이 된다")
				.isEqualTo(1);
	}

	@Test
	@DisplayName("@DiscriminatorColumn 서브타입 조건을 instanceOf로 표현한다 — 판별자를 재계산하지 않는다")
	void 판별자_서브타입_조건() {
		List<Product> 책상만 = queryFactory.selectFrom(product)
				.where(product.instanceOf(Desk.class))
				.fetch();

		assertThat(책상만).extracting(Product::getId).containsExactly(deskId);
		assertThat(책상만.getFirst()).isInstanceOf(Desk.class);
	}

	@Test
	@DisplayName("판별자 컬럼의 읽기 전용 매핑(Product.specType)이 5종 전부에서 실제 값을 돌려준다")
	void 판별자_읽기전용_매핑_5종() {
		Long monitorId = productRepository.save(모니터()).getId();
		Long armId = productRepository.save(암()).getId();
		Long lightId = productRepository.save(조명()).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(규격(deskId)).isEqualTo(SpecType.DESK);
		assertThat(규격(monitorId)).isEqualTo(SpecType.MONITOR);
		assertThat(규격(armId)).isEqualTo(SpecType.ARM);
		assertThat(규격(lightId)).isEqualTo(SpecType.LIGHT);
		assertThat(규격(propId)).isEqualTo(SpecType.PROP);

		// 매핑된 값과 SpecType.of(구체 타입)가 갈리면 정본이 둘이 된다.
		Product 책상 = productRepository.findById(deskId).orElseThrow();
		assertThat(책상.getSpecType()).isEqualTo(SpecType.of(책상));
	}

	@Test
	@DisplayName("읽기 전용 매핑이라 INSERT·UPDATE에 끼지 않는다 — 값을 쓰는 쪽은 여전히 판별자뿐이다")
	void 판별자_읽기전용_매핑은_쓰기에_끼지_않는다() {
		// 저장은 setUp이 이미 했다(쓰기 매핑이었다면 부팅이나 INSERT에서 죽는다). 공통 필드를
		// 바꿔 UPDATE를 내도 spec_type은 그대로여야 한다.
		Product 책상 = productRepository.findById(deskId).orElseThrow();
		책상.updateCommon(null, 책상.getCategory(), "이름만 바꾼 책상", null, 250_000, null);
		entityManager.flush();
		entityManager.clear();

		assertThat(규격(deskId)).isEqualTo(SpecType.DESK);
	}

	@Test
	@DisplayName("@ConcreteProxy 덕에 다형 루트의 LAZY 프록시가 구체 타입으로 해석된다 — instanceof도 getSpecType()도 맞다")
	void 다형_루트_LAZY_프록시는_구체_타입이다() {
		Product 프록시 = entityManager.getReference(Product.class, deskId);

		// 초기화하지 않은 프록시인데도 구체 타입이다 — @ConcreteProxy가 없으면 여기가 거짓이 되고,
		// SpecType.of가 PRODUCT_UNKNOWN_SPEC_SUBTYPE으로 500을 낸다.
		assertThat(Hibernate.isInitialized(프록시)).isFalse();
		assertThat(프록시)
				.as("@ConcreteProxy가 빠지면 Product$HibernateProxy가 와서 instanceof가 전부 거짓이 된다")
				.isInstanceOf(Desk.class);
		assertThat(SpecType.of(프록시)).isEqualTo(SpecType.DESK);

		assertThat(프록시.getSpecType()).isEqualTo(SpecType.DESK);
	}

	@Test
	@DisplayName("규격 필터를 enum 값 비교로 쓴다 — eq·in 둘 다 실제 SQL로 번역된다")
	void 판별자_enum_비교_조건() {
		Long monitorId = productRepository.save(모니터()).getId();
		entityManager.flush();
		entityManager.clear();

		List<Product> 책상만 = queryFactory.selectFrom(product)
				.where(product.specType.eq(SpecType.DESK))
				.fetch();
		List<Product> 절차생성만 = queryFactory.selectFrom(product)
				.where(product.specType.in(SpecType.proceduralTypes()))
				.orderBy(product.id.asc())
				.fetch();

		assertThat(책상만).extracting(Product::getId).containsExactly(deskId);
		assertThat(절차생성만).extracting(Product::getId).containsExactly(deskId, monitorId);
	}

	private SpecType 규격(Long id) {
		return productRepository.findById(id).orElseThrow().getSpecType();
	}

	private Monitor 모니터() {
		return Monitor.create(ProductSource.CATALOG, null, null, 카테고리, "U2725QE", null, 700_000,
				null, new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null, 130, true, true,
				null, null, null, null, 5_000, null);
	}

	private Arm 암() {
		return Arm.create(ProductSource.CATALOG, null, null, 카테고리, "LX 데스크 마운트", null, 329_000,
				null, ArmKind.MONITOR, ArmType.ARTICULATED, 1, 2, null, 100, 640, 0, 330,
				new ArmMounting(true, true, false), 10, 60, -5, 70, 360, 360, true, true, 11_300);
	}

	private Light 조명() {
		return Light.create(ProductSource.CATALOG, null, null, 카테고리, "포뇌스", null, 29_900, null,
				120, 120, 400, false, null, null, false, null, null, null, null);
	}

	/** ADR-0018 결정 2가 QueryDSL을 채택한 이유 — 조건이 null이면 QueryDSL이 where 절에서 통째로 뺀다. */
	private BooleanExpression 이름이(String 이름) {
		return 이름 == null ? null : product.name.eq(이름);
	}

	private Statistics 통계() {
		return entityManager.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
	}
}
