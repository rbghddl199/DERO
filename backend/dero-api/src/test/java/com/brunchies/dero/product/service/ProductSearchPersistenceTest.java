package com.brunchies.dero.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import com.brunchies.dero.AbstractElasticsearchIntegrationTest;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductCreateRequest;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.dto.PropSpecRequest;
import com.brunchies.dero.product.repository.ProductRepository;
import java.io.IOException;
import java.io.StringReader;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 제품 검색(ADR-0019)을 진짜 ES + Nori로 검증한다.
 *
 * <p>여기가 확인하는 것은 슬라이스로는 판정할 수 없는 것들이다 — <b>Nori가 실제로 띄어쓰기 불일치를
 * 흡수하는가</b>(이 ADR이 ES를 고른 이유), 노출 규칙을 정말 Postgres가 판정하는가, 커밋 후 색인
 * 리스너가 도는가, ES가 답하지 못할 때 폴백 없이 503이 되는가.
 *
 * <p><b>테스트 트랜잭션을 끈다</b> — {@code @TransactionalEventListener(AFTER_COMMIT)}는 커밋이
 * 없으면 아예 실행되지 않으므로, 롤백되는 테스트 트랜잭션 안에서는 색인 경로를 검증할 수 없다.
 * 대신 매 테스트 후 직접 지운다({@code CartItemControllerTest}와 같은 판단).
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ProductSearchPersistenceTest extends AbstractElasticsearchIntegrationTest {

	@Autowired
	private ProductSearchService productSearchService;

	@Autowired
	private ProductCatalogService productCatalogService;

	@Autowired
	private AdminProductService adminProductService;

	@Autowired
	private ProductRepository products;

	@Autowired
	private BrandRepository brands;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private ElasticsearchClient elasticsearch;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	private Long brandId;
	private Long categoryId;

	@BeforeEach
	void setUp() {
		Brand brand = brands.save(Brand.create("라이트크래프트", null, null, null));
		brandId = brand.getId();
		Category category = categories.save(Category.createRoot("데스크", null, 1));
		categoryId = category.getId();

		승인된_소품(brand, category, "모니터 암");
		승인된_소품(brand, category, "듀얼 모니터 받침대");
		승인된_소품(brand, category, "라이트크래프트 스탠드 조명");
		// '하'로 시작하는 이름이 하나는 있어야 오매칭이 재현된다 — min_gram이 1이면 무의미 질의가
		// 흘리는 1글자 형태소('하')가 이 제품의 1글자 접두 토큰과 맞는다(ADR-0028).
		승인된_소품(brand, category, "하이엔드 풋레스트");

		// 대분류 → 소분류 두 단. 제품은 소분류에 달리고 이름에 대분류 단어가 없다 — 운영에서 '음향'이
		// 0건이던 모양 그대로다(ADR-0029). 한 단짜리 픽스처로는 조상 경로가 공허하게 통과한다.
		Category 음향 = categories.save(Category.createRoot("음향", null, 2));
		Category 스피커 = categories.save(Category.createChild(음향, "스피커", null, 1));
		승인된_소품(brand, 스피커, "제닉스 X10 사운드바");

		productSearchService.reindexAll();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("TRUNCATE TABLE product, brand, category RESTART IDENTITY CASCADE");
	}

	@Test
	@DisplayName("띄어쓰기가 달라도 찾는다 — '모니터암'으로 '모니터 암'이 나온다(Nori를 쓰는 이유)")
	void 띄어쓰기_불일치() {
		assertThat(names(search("모니터암"))).contains("모니터 암");
	}

	@Test
	@DisplayName("부분어로도 찾는다 — '모니'가 '모니터'로 시작하는 제품을 전부 잡는다(edge n-gram)")
	void 부분어() {
		assertThat(names(search("모니"))).contains("모니터 암", "듀얼 모니터 받침대");
	}

	@Test
	@DisplayName("오타를 흡수한다 — '모니타'로 '모니터 암'이 나온다(fuzziness)")
	void 오타() {
		assertThat(names(search("모니타"))).contains("모니터 암");
	}

	@Test
	@DisplayName("제대로 친 단어는 그 단어가 든 제품만 잡는다 — '모니터'에 조명·풋레스트가 안 섞인다")
	void 정확한_단어() {
		assertThat(names(search("모니터"))).containsExactlyInAnyOrder("모니터 암", "듀얼 모니터 받침대");
	}

	@Test
	@DisplayName("분류어로도 찾는다 — '음향'이 이름에 없는 스피커 제품을 잡는다(조상 카테고리 색인)")
	void 분류어_대분류() {
		assertThat(names(search("음향"))).contains("제닉스 X10 사운드바");
	}

	@Test
	@DisplayName("소분류 이름으로도 찾는다 — '스피커'가 그 분류 제품을 잡는다")
	void 분류어_소분류() {
		assertThat(names(search("스피커"))).contains("제닉스 X10 사운드바");
	}

	/**
	 * 분류어가 카탈로그 전량을 끌어오지 않는다는 가드. {@code categoryPath} 절이 {@code AND}가 아니면
	 * 다른 분류 제품이 조각 하나로 딸려 오고, 그 순간 "분류어 검색"은 "전체 목록"과 같아진다.
	 */
	@Test
	@DisplayName("분류어는 그 분류만 잡는다 — '음향'에 데스크 분류 제품이 안 섞인다")
	void 분류어는_그_분류만() {
		assertThat(names(search("음향"))).doesNotContain("모니터 암", "하이엔드 풋레스트");
	}

	/**
	 * 오매칭 회귀 가드(ADR-0028). <b>0건이 나와야 카탈로그 공백 대시보드가 산다</b> —
	 * ADR-0020 결정 7의 "0건 질의" 패널은 이런 질의가 무언가를 돌려주는 한 영원히 비어 있다.
	 */
	@Test
	@DisplayName("무의미한 한글 질의는 0건이다 — 1글자 형태소가 그 글자로 시작하는 제품을 끌어오지 않는다")
	void 무의미한_한글_질의() {
		assertThat(names(search("존재하지않는제품명asdf"))).isEmpty();
	}

	@Test
	@DisplayName("무의미한 라틴 질의는 0건이다")
	void 무의미한_라틴_질의() {
		assertThat(names(search("zzqqxx"))).isEmpty();
	}

	@Test
	@DisplayName("추천어는 접두로 뜬다 — '모니'가 이름이 그렇게 시작하는 제품을 세운다")
	void 추천어_접두() {
		assertThat(productCatalogService.suggest("모니").suggestions()).contains("모니터 암");
	}

	@Test
	@DisplayName("이름 중간 어절로도 추천어가 뜬다 — '받침'으로 '듀얼 모니터 받침대'가 나온다(어절 접미 입력)")
	void 추천어_중간_어절() {
		assertThat(productCatalogService.suggest("받침").suggestions()).contains("듀얼 모니터 받침대");
	}

	@Test
	@DisplayName("띄어쓰기가 달라도 추천어가 뜬다 — '모니터암'으로 '모니터 암'이 나온다")
	void 추천어_띄어쓰기_불일치() {
		assertThat(productCatalogService.suggest("모니터암").suggestions()).contains("모니터 암");
	}

	@Test
	@DisplayName("숨긴 제품 이름은 추천어에도 안 나온다 — 색인에 남아 있어도 Postgres가 걸러낸다")
	void 추천어_숨긴_제품_제외() {
		Product hidden = products.findAll().stream()
				.filter(product -> product.getName().equals("모니터 암"))
				.findFirst()
				.orElseThrow();
		hidden.hide();
		products.save(hidden);

		// 같은 질의에 남은 제품은 그대로 나온다 — 목록이 통째로 비어서 통과하는 것이 아님을 못 박는다.
		assertThat(productCatalogService.suggest("모니").suggestions())
				.doesNotContain("모니터 암")
				.contains("듀얼 모니터 받침대");
	}

	@Test
	@DisplayName("질의어가 비면 ES를 부르지 않고 빈 목록이다")
	void 추천어_빈_질의() {
		assertThat(productCatalogService.suggest("  ").suggestions()).isEmpty();
	}

	@Test
	@DisplayName("옛 매핑 인덱스가 붙어 있으면 부팅이 알아서 재색인한다 — 배포 직후 추천어가 죽지 않는다")
	void 매핑이_낡으면_부팅에_재색인() throws IOException {
		// suggest 필드가 없던 시절(DERO-384)의 인덱스를 그대로 재현한다.
		String legacy = "products_v_legacy";
		elasticsearch.indices().create(create -> create.index(legacy).withJson(new StringReader(
				"{\"mappings\":{\"properties\":{\"name\":{\"type\":\"text\"}}}}")));
		for (String current : elasticsearch.indices()
				.getAlias(alias -> alias.name(ProductSearchService.ALIAS)).aliases().keySet()) {
			elasticsearch.indices().updateAliases(update -> update
					.actions(action -> action.remove(remove -> remove
							.index(current).alias(ProductSearchService.ALIAS)))
					.actions(action -> action.add(add -> add
							.index(legacy).alias(ProductSearchService.ALIAS))));
			elasticsearch.indices().delete(delete -> delete.index(current));
		}

		productSearchService.prepareIndex();

		assertThat(productCatalogService.suggest("모니").suggestions()).contains("모니터 암");
	}

	@Test
	@DisplayName("규격·카테고리 필터가 검색에도 그대로 걸린다")
	void 검색에도_필터가_걸린다() {
		CursorPage<ProductDetailResponse> 다른_규격 =
				productCatalogService.list(SpecType.DESK, null, "모니터", null, 20);

		assertThat(다른_규격.content()).isEmpty();
		assertThat(names(productCatalogService.list(SpecType.PROP, List.of(categoryId), "모니터",
				null, 20))).contains("모니터 암");
	}

	@Test
	@DisplayName("숨긴 제품은 색인에 남아 있어도 검색에 안 나온다 — 노출은 Postgres가 판정한다")
	void 숨긴_제품_제외() {
		Product hidden = products.findAll().stream()
				.filter(product -> product.getName().equals("모니터 암"))
				.findFirst()
				.orElseThrow();
		hidden.hide();
		products.save(hidden);

		assertThat(names(search("모니터암"))).doesNotContain("모니터 암");
	}

	@Test
	@DisplayName("등록하면 재색인 없이도 검색된다 — AFTER_COMMIT 색인")
	void 등록_직후_검색된다() {
		Long id = adminProductService.create(new AdminProductCreateRequest(SpecType.PROP, brandId,
				categoryId, "인체공학 마우스패드", null, 20_000, "https://example.com/pad", null,
				null, null, null, null,
				new PropSpecRequest(900, 400, 3, 800, false, MountSurface.TOP))).id();

		// 색인에 들어갔는지를 본다 — 갓 등록한 소품은 검수 전이라 카탈로그 목록에는 아직 안 뜬다.
		assertThat(productSearchService.searchIds("마우스패드")).contains(id);
	}

	@Test
	@DisplayName("삭제하면 색인에서도 빠진다")
	void 삭제하면_색인에서_빠진다() {
		Long id = adminProductService.create(new AdminProductCreateRequest(SpecType.PROP, brandId,
				categoryId, "인체공학 마우스패드", null, 20_000, "https://example.com/pad", null,
				null, null, null, null,
				new PropSpecRequest(900, 400, 3, 800, false, MountSurface.TOP))).id();

		adminProductService.delete(id);

		assertThat(productSearchService.searchIds("마우스패드")).doesNotContain(id);
	}

	@Test
	@DisplayName("브랜드명이 Nori 사용자 사전에 실린다 — 없으면 브랜드가 쪼개져 엉뚱한 검색에 걸린다")
	void 브랜드_사전이_실린다() throws IOException {
		String settings = elasticsearch.indices()
				.getSettings(request -> request.index(ProductSearchService.ALIAS))
				.settings().values().stream()
				.map(Object::toString)
				.reduce("", String::concat);

		assertThat(settings).contains("라이트크래프트");
	}

	@Test
	@DisplayName("ES가 답하지 못하면 503이다 — ILIKE로도 클라 필터로도 폴백하지 않는다")
	void 인덱스가_없으면_503() throws IOException {
		// 별칭 이름으로는 못 지운다("matches an alias, specify the corresponding concrete indices")
		// — 실체 인덱스를 찾아 지운다. ES가 죽은 것과 같은 상태를 만든다.
		for (String index : elasticsearch.indices()
				.getAlias(alias -> alias.name(ProductSearchService.ALIAS)).aliases().keySet()) {
			elasticsearch.indices().delete(delete -> delete.index(index));
		}

		assertThatThrownBy(() -> productSearchService.searchIds("모니터"))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SEARCH_UNAVAILABLE));
		assertThatThrownBy(() -> productCatalogService.suggest("모니터"))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(ProductErrorCode.PRODUCT_SEARCH_UNAVAILABLE));
	}

	/**
	 * ES 왕복이 트랜잭션 밖이라는 <b>불변식</b>을 못 박는다. 커넥션 점유는 눈에 안 보여서, 누가
	 * {@code searchIds}를 트랜잭션 안으로 도로 넣어도 기능 테스트는 전부 초록이고 <b>부하가 올 때
	 * 관계없는 API가 같이 죽는 것</b>으로만 드러난다.
	 */
	@Test
	@DisplayName("검색 질의를 트랜잭션 안에서 부르면 터진다 — ES 왕복 동안 커넥션을 물지 않는다")
	void 트랜잭션_안에서는_검색을_못_부른다() {
		TransactionTemplate transaction = new TransactionTemplate(transactionManager);

		assertThatThrownBy(() -> transaction.execute(status -> productSearchService.searchIds("모니터")))
				.isInstanceOf(IllegalTransactionStateException.class);
		assertThatThrownBy(() -> transaction.execute(status -> productSearchService.suggestIds("모니터")))
				.isInstanceOf(IllegalTransactionStateException.class);
	}

	private CursorPage<ProductDetailResponse> search(String q) {
		return productCatalogService.list(null, null, q, null, 20);
	}

	private static List<String> names(CursorPage<ProductDetailResponse> page) {
		return page.content().stream().map(ProductDetailResponse::name).toList();
	}

	/**
	 * 소품은 GLB 필수 3종이라 <b>검수 통과 에셋이 없으면 카탈로그에 아예 안 뜬다</b>
	 * ({@code ProductRepositoryImpl.reviewApprovedOrProceduralCatalog}) — 에셋을 안 붙이면 검색
	 * 결과가 늘 비어서 모든 단언이 공허하게 통과한다(2026-08-06 실측).
	 */
	private void 승인된_소품(Brand brand, Category category, String name) {
		Product saved = products.save(Prop.create(ProductSource.CATALOG, null, brand, category, name,
				null, 50_000, "https://example.com/" + Math.abs(name.hashCode()), 300, 200, 100,
				1_200, false, MountSurface.TOP));
		saved.registerAsset("assets/" + Math.abs(name.hashCode()) + ".glb", GlbExportMode.TEXTURE,
				null, 5_000, null);
		products.save(saved);
	}
}
