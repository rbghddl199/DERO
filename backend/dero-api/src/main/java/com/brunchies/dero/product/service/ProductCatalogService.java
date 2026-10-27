package com.brunchies.dero.product.service;

import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.catalog.service.CategoryService;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.ArmMounting;
import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Light;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductEmitter;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.ProductVesa;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.ArmSpecRequest;
import com.brunchies.dero.product.dto.AssetDetailResponse;
import com.brunchies.dero.product.dto.DeskSpecRequest;
import com.brunchies.dero.product.dto.LightSpecRequest;
import com.brunchies.dero.product.dto.MonitorSpecRequest;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.dto.ProductEmitterResponse;
import com.brunchies.dero.product.dto.ProductImageDetailResponse;
import com.brunchies.dero.product.dto.ProductSuggestionsResponse;
import com.brunchies.dero.product.dto.PropSpecRequest;
import com.brunchies.dero.product.repository.ProductRepository;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 제품 카탈로그 조회 — {@code GET /products} 목록과 {@code GET /products/{id}} 상세
 * (`docs/context/api-spec.md` §5).
 *
 * <p><b>컬렉션은 {@code /products} 하나다</b> — 옛 {@code /products/desks}는 필터를 경로로 승격시킨
 * 것이라 없앴다(같은 문서 §11). <b>목록도 규격 5종 전부를 다룬다</b>(DERO-325) —
 * {@code specType}·{@code categoryId}는 둘 다 선택 필터이고, 생략하면 전체 제품이 등록순으로 나온다.
 *
 * <p><b>목록도 상세와 마찬가지로 엔티티를 직접 읽는다</b>(DERO-325 재작업) — {@code Product}를
 * 다형 루트로 조회하면 JOINED 상속이 desk·monitor·arm·light·prop 5개 테이블을 전부 LEFT JOIN하는 SQL
 * 한 방을 내므로 규격별 배치 조회가 필요 없고, {@code deskSpec}/{@code monitorSpec}/... 같은
 * {@link #getDetail}의 변환 헬퍼를 그대로 재사용한다. {@code brand}·{@code category}·{@code asset}·
 * {@code emitter}는 전부 to-one이라 {@code join fetch}로 같이 끌어와도 페이지네이션이 깨지지 않는다
 * ({@link ProductRepository#findCatalogPage}). {@code product_image}·{@code product_vesa}만
 * to-many라 여전히 별도 {@code IN} 배치 조회로 뺀다.
 *
 * <p><b>상세는 5종 전부를 다룬다</b> — 목록과 달리 규격별 쿼리가 필요 없고(루트를 id로 읽으면
 * Hibernate가 구체 서브타입을 준다) 관리자 수정 폼·검수 화면이 현재값을 읽을 곳이 여기뿐이다(§9).
 */
@Service
@Transactional(readOnly = true)
public class ProductCatalogService {

	private final ProductRepository products;
	private final CategoryService categoryService;
	private final PresignPort presignPort;
	private final PublicImageUrlResolver publicImageUrl;
	private final ProductSearchService productSearchService;

	/**
	 * DB 구간을 감싸는 짧은 읽기 트랜잭션. 검색 경로가 클래스 레벨 트랜잭션을 벗어야 해서
	 * ({@link #list} 참조) 그 자리를 대신 채운다.
	 *
	 * <p><b>자동 구성된 {@code TransactionTemplate} 빈을 주입하지 않고 직접 만든다</b> — 그 빈은
	 * 기본 전파에 <b>읽기 전용이 아니다.</b> 읽기 경로에 읽기·쓰기 트랜잭션을 쓰면 "안전 기본값이
	 * 읽기"라는 규칙(architecture.md 규칙 10)이 이 클래스에서만 뒤집힌다. 손으로 쓴 생성자가 남아
	 * 있는 이유가 이 조립이다({@code enum-and-lombok.md} 규칙 2의 허용 사유).
	 */
	private final TransactionTemplate reads;

	public ProductCatalogService(ProductRepository products, CategoryService categoryService,
			PresignPort presignPort, PublicImageUrlResolver publicImageUrl,
			ProductSearchService productSearchService,
			PlatformTransactionManager transactionManager) {
		this.products = products;
		this.categoryService = categoryService;
		this.presignPort = presignPort;
		this.publicImageUrl = publicImageUrl;
		this.productSearchService = productSearchService;
		this.reads = new TransactionTemplate(transactionManager);
		this.reads.setReadOnly(true);
	}

	/**
	 * {@code GET /products} 목록 — {@code specType}·{@code categoryId} 둘 다 선택 필터다(생략하면
	 * 전체). 규격 5종 전부를 다룬다(DERO-325).
	 *
	 * <p>{@code categoryId}는 <b>하위 트리 전체로 롤업</b>된다 — 대분류를 골라도 중·소분류에 배정된
	 * 제품이 함께 나온다({@link CategoryService#selfAndDescendantIds}).
	 *
	 * <p><b>{@code categoryId}는 여러 개를 받는다</b> — 시뮬레이터 라이브러리의 기본 선택인 '전체'
	 * 타일이 "책상을 뺀 대분류 전부"라, 파라미터를 생략하면 책상까지 섞여 나온다. 프론트가 받은 뒤
	 * 걸러 내면 페이지 하나가 통째로 안 보이는 제품으로 채워질 수 있어 커서 페이지네이션이 어긋난다
	 * (그래서 프론트에 빈 페이지 연쇄 재요청 루프가 붙어 있었다 — {@code useCatalogPage.ts}).
	 * 빈 목록과 {@code null}은 같게 다룬다: 카테고리 필터 없음.
	 *
	 * <p><b>{@code q}가 있으면 검색 경로로 갈라진다</b>(ADR-0019) — 규격·카테고리 필터는 그대로
	 * 같이 걸린다. {@code q}가 없으면 지금까지와 한 글자도 다르지 않다.
	 *
	 * <p><b>{@code SUPPORTS}이고 DB 구간만 {@link #reads}로 감싼다.</b> 검색 경로는
	 * 카테고리 롤업(DB) → ES 왕복 → 상세 조회(DB) 순서라, 하나의 트랜잭션으로 묶으면 <b>ES가 답할
	 * 때까지 커넥션 하나를 문 채 기다린다</b> — Hibernate는 첫 SQL에서 커넥션을 잡고 트랜잭션 끝까지
	 * 쥐므로, 앞선 롤업 쿼리가 이미 잡아 둔 커넥션이 왕복 내내 놀고 있게 된다. 시뮬레이터
	 * 라이브러리가 '전체' 타일에서 {@code categoryId}를 항상 실으므로 이 경로가 검색의 기본값이다.
	 * ES는 폴백이 없어(ADR-0019 결정 6) 그 지연이 그대로 커넥션 보유 시간이 되고, 마르는 것은 검색이
	 * 아니라 <b>관계없는 API 전부</b>다. {@code GeneratedImageService.publish}가 AI 호출에 쓴 것과
	 * 같은 구조다.
	 *
	 * <p><b>{@code NEVER}가 아니라 {@code SUPPORTS}인 이유</b>: 운영에서는 둘이 같다(컨트롤러가 유일한
	 * 호출부라 바깥 트랜잭션이 없고, {@code SUPPORTS}는 그때 <b>트랜잭션 없이</b> 돈다). 갈리는 곳은
	 * 테스트다 — 통합 테스트는 {@code AbstractPostgresIntegrationTest}의 클래스 레벨
	 * {@code @Transactional}로 격리하는데, {@code NEVER}면 롤백 격리를 쓰는 기존 테스트가 통째로
	 * 못 돌고({@code NOT_SUPPORTED}로 중단시키면 커밋 안 된 픽스처가 안 보인다) <b>격리 전략을
	 * 갈아엎어야 한다.</b> 진짜 못은 어차피 {@link ProductSearchService#searchIds} 쪽 {@code NEVER}다 —
	 * 트랜잭션 안에서 이 메서드를 부르면 거기서 터진다.
	 *
	 * <p><b>비검색 경로는 여전히 트랜잭션 하나다</b> — 쿼리 셋과 지연 로딩이 한 경계 안에 있어야 한다.
	 */
	@Transactional(propagation = Propagation.SUPPORTS)
	public CursorPage<ProductDetailResponse> list(
			SpecType specType, Collection<Long> categoryId, String q, String cursor, int size) {
		if (q == null || q.isBlank()) {
			return reads.execute(status -> catalogPage(specType, rollUp(categoryId), cursor, size));
		}

		List<Long> categoryIds = reads.execute(status -> rollUp(categoryId));
		// 여기가 이 메서드에서 유일하게 오래 걸리는 구간이고, 그래서 트랜잭션 밖이다.
		List<Long> hitIds = productSearchService.searchIds(q);
		return reads.execute(status -> searchPage(specType, categoryIds, hitIds, cursor, size));
	}

	/** {@code categoryId} 하나를 하위 트리 전체로 편다. 빈 목록과 {@code null}은 같게 다룬다. */
	private List<Long> rollUp(Collection<Long> categoryId) {
		return categoryId == null || categoryId.isEmpty()
				? null
				: categoryService.selfAndDescendantIds(categoryId);
	}

	/** 등록순 목록 — 트랜잭션 하나 안에서 돈다. */
	private CursorPage<ProductDetailResponse> catalogPage(
			SpecType specType, List<Long> categoryIds, String cursor, int size) {
		Long cursorId = CursorCodec.decode(cursor);
		List<Product> rows =
				products.findCatalogPage(specType, categoryIds, cursorId, Limit.of(size + 1));
		boolean hasNext = rows.size() > size;
		List<Product> content = hasNext ? rows.subList(0, size) : rows;

		// 이후 페이지는 첫 페이지가 이미 돌려준 값을 프론트가 들고 있다 — 매 페이지 재계산하지 않는다(M3).
		long totalCount = cursorId == null ? products.countCatalogListPage(specType, categoryIds) : 0;
		String nextCursor = hasNext ? CursorCodec.encode(content.get(content.size() - 1).getId()) : null;

		return new CursorPage<>(toResponses(content), nextCursor, hasNext, totalCount);
	}

	/**
	 * 검색 경로 — <b>ES가 정하는 것은 어떤 제품이 몇 번째로 관련 있는가뿐이다.</b> 노출 규칙(숨김·
	 * 검수·소프트 삭제)과 규격·카테고리 필터는 Postgres가 판정하고, 그래서 검색 결과와 카탈로그
	 * 목록이 같은 술어를 공유한다(ADR-0019 결정 4).
	 *
	 * <p><b>커서에 담기는 값이 목록 경로와 다르다</b> — 등록순 목록은 마지막 {@code id}지만 여기는
	 * <b>오프셋</b>이다. 관련도 순서에는 "이 id 다음"이라는 기준이 없다(점수가 같은 제품이 흔하고,
	 * 재색인 후 순서가 통째로 바뀔 수도 있다). 커서는 프론트가 열어보지 않는 불투명 문자열이라
	 * ({@link CursorCodec}) 담는 내용이 갈려도 호출부는 영향받지 않는다.
	 *
	 * <p>{@code totalCount}는 매 페이지 채운다 — 목록 경로와 달리 세는 데 추가 쿼리가 들지 않는다
	 * (걸러 낸 목록이 이미 손에 있다).
	 *
	 * <p><b>ES 히트 id를 인자로 받는다</b> — 여기서 부르면 ES 왕복이 이 트랜잭션 안에 들어온다
	 * ({@link #list} 참조).
	 */
	private CursorPage<ProductDetailResponse> searchPage(
			SpecType specType, List<Long> categoryIds, List<Long> hitIds, String cursor, int size) {
		if (hitIds.isEmpty()) {
			return new CursorPage<>(List.of(), null, false, 0);
		}

		Map<Long, Product> byId = products.findCatalogByIds(hitIds, specType, categoryIds).stream()
				.collect(Collectors.toMap(Product::getId, product -> product));
		List<Product> visible = hitIds.stream().map(byId::get).filter(Objects::nonNull).toList();

		Long decoded = CursorCodec.decode(cursor);
		int offset = decoded == null ? 0 : Math.max(decoded.intValue(), 0);
		int from = Math.min(offset, visible.size());
		int to = Math.min(from + size, visible.size());
		boolean hasNext = to < visible.size();

		return new CursorPage<>(
				toResponses(visible.subList(from, to)),
				hasNext ? CursorCodec.encode((long) to) : null,
				hasNext,
				visible.size());
	}

	/**
	 * 입력창 아래에 세울 <b>추천어</b> — 접두가 걸리는 제품 이름을 관련도 순으로 돌려준다
	 * (ADR-0019 결정 1의 요구 ③).
	 *
	 * <p><b>ES가 준 문자열을 그대로 내보내지 않는다.</b> 색인은 살아 있는 제품 전량이라 숨김·검수
	 * 대기 제품이 섞여 있고, 그 이름을 드롭다운에 세우면 <b>아직 공개하지 않은 제품명이 노출된 뒤
	 * 눌러도 0건</b>이다. id로 Postgres를 다시 읽어 목록·검색과 같은 노출 술어를 태운다(결정 4).
	 *
	 * <p>이름이 같은 제품이 여럿이면 하나로 합친다 — 추천어는 제품이 아니라 <b>다음에 칠 문자열</b>이라
	 * 같은 줄이 두 번 서면 고를 이유가 없는 선택지가 된다.
	 *
	 * <p><b>{@link #list}와 같은 이유로 {@code NEVER}다</b> — 그리고 이쪽이 더 급하다. 키 입력마다 오는
	 * 호출이라 트랜잭션 안에 있으면 타이핑 한 줄이 ES 왕복을 기다리는 커넥션을 여러 개 만든다.
	 * 여기는 ES가 DB보다 먼저라 감쌀 구간이 뒤쪽 하나뿐이다.
	 */
	@Transactional(propagation = Propagation.SUPPORTS)
	public ProductSuggestionsResponse suggest(String q) {
		if (q == null || q.isBlank()) {
			return new ProductSuggestionsResponse(List.of());
		}
		List<Long> candidateIds = productSearchService.suggestIds(q);
		if (candidateIds.isEmpty()) {
			return new ProductSuggestionsResponse(List.of());
		}
		return reads.execute(status -> suggestionsFor(candidateIds));
	}

	private ProductSuggestionsResponse suggestionsFor(List<Long> candidateIds) {
		Map<Long, Product> byId = products.findCatalogByIds(candidateIds).stream()
				.collect(Collectors.toMap(Product::getId, product -> product));
		return new ProductSuggestionsResponse(candidateIds.stream()
				.map(byId::get)
				.filter(Objects::nonNull)
				.map(Product::getName)
				.distinct()
				.limit(ProductSearchService.MAX_SUGGESTIONS)
				.toList());
	}

	/**
	 * 주어진 id의 제품을 <b>넘겨준 순서 그대로</b> 목록 원소로 조립한다 — 정렬 기준이 제품 밖에 있는
	 * 목록(내가 찜한 제품 순서 등)이 쓴다. 카탈로그 노출 규칙({@code ACTIVE}·검수 통과)은 그대로
	 * 적용되므로 <b>돌려주는 개수가 요청한 id 개수보다 적을 수 있다.</b>
	 *
	 * <p>이 메서드가 {@code product} 쪽에 있는 이유: 목록 원소 조립 규칙(대표 이미지 1장·VESA 정렬·
	 * presign)이 {@link #list}와 한 글자도 갈리면 안 된다. 호출부(찜 목록)는 id 순서만 정한다.
	 */
	public List<ProductDetailResponse> listByIds(List<Long> productIds) {
		if (productIds.isEmpty()) {
			return List.of();
		}
		Map<Long, Product> byId = products.findCatalogByIds(productIds).stream()
				.collect(Collectors.toMap(Product::getId, product -> product));
		return toResponses(productIds.stream().map(byId::get).filter(Objects::nonNull).toList());
	}

	/** 목록 응답 조립 — 대표 이미지·VESA만 {@code IN} 배치 조회로 따로 채운다(to-many라 페치조인 불가). */
	private List<ProductDetailResponse> toResponses(List<Product> content) {
		List<Long> ids = content.stream().map(Product::getId).toList();

		Map<Long, ProductImage> primaryImageById = ids.isEmpty()
				? Map.of()
				: products.findPrimaryImagesByProductIdIn(ids).stream()
						.collect(Collectors.toMap(image -> image.getProduct().getId(), image -> image));
		Map<Long, List<ProductVesa>> vesasByProductId = ids.isEmpty()
				? Map.of()
				: products.findVesasByProductIdIn(ids).stream()
						.collect(Collectors.groupingBy(vesa -> vesa.getProduct().getId()));

		return content.stream()
				.map(product -> new ProductDetailResponse(
						product.getId(),
						SpecType.of(product),
						product.getSource(),
						product.getBrand() == null ? null : product.getBrand().getId(),
						product.getBrand() == null ? null : product.getBrand().getName(),
						product.getCategory().getId(),
						product.getCategory().getName(),
						product.getName(),
						product.getDescription(),
						product.getPriceKrw(),
						product.getProductUrl(),
						product.getStatus(),
						product instanceof Desk desk ? deskSpec(desk) : null,
						product instanceof Monitor monitor ? monitorSpec(monitor) : null,
						product instanceof Arm arm ? armSpec(arm) : null,
						product instanceof Light light ? lightSpec(light) : null,
						product instanceof Prop prop ? propSpec(prop) : null,
						assetDetail(product.getAsset(), false),
						emitterDetail(product.getEmitter()),
						primaryImageDetail(primaryImageById.get(product.getId())),
						vesaSpecs(vesasByProductId.getOrDefault(product.getId(), List.of()))))
				.toList();
	}

	/**
	 * 단건 상세. 규격·에셋·발광·실사 이미지를 한 응답에 담는다.
	 *
	 * <p><b>엔티티를 통째로 읽는다</b> — 목록이 프로젝션으로 우회하는 이유(nullable 역방향 1:1인
	 * {@code asset}·{@code emitter} 때문에 행마다 SELECT가 2개 더 나간다)는 단건에서는 성립하지
	 * 않는다. 어차피 둘 다 응답에 실어야 하고 행이 하나다.
	 *
	 * <p>{@code callerUserId}는 익명이면 {@code null}이다 — 지금 이 경로는 {@code permitAll}이라
	 * 인증 없는 요청이 실제로 들어온다.
	 */
	public ProductDetailResponse getDetail(Long productId, Long callerUserId, boolean admin) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));
		requireVisible(product, callerUserId, admin);

		return new ProductDetailResponse(
				product.getId(),
				SpecType.of(product),
				product.getSource(),
				product.getBrand() == null ? null : product.getBrand().getId(),
				product.getBrand() == null ? null : product.getBrand().getName(),
				product.getCategory().getId(),
				product.getCategory().getName(),
				product.getName(),
				product.getDescription(),
				product.getPriceKrw(),
				product.getProductUrl(),
				product.getStatus(),
				product instanceof Desk desk ? deskSpec(desk) : null,
				product instanceof Monitor monitor ? monitorSpec(monitor) : null,
				product instanceof Arm arm ? armSpec(arm) : null,
				product instanceof Light light ? lightSpec(light) : null,
				product instanceof Prop prop ? propSpec(prop) : null,
				assetDetail(product.getAsset(), admin),
				emitterDetail(product.getEmitter()),
				imageDetails(product.getImages()),
				vesaSpecs(product.getVesas()));
	}

	/**
	 * 가시성 판정(api-spec §9). <b>숨기는 것은 403이 아니라 404다</b> — 존재 여부 자체가 정보이고,
	 * 403은 "그 id의 제품이 있다"를 알려 준다.
	 *
	 * <ul>
	 *   <li>{@code HIDDEN} — 운영진이 카탈로그에서 내린 제품이라 ADMIN만 본다. 업로더 본인도 못 본다:
	 *       내린 주체가 운영진이므로 본인에게 계속 보이면 "왜 목록에 없나"만 헷갈린다
	 *   <li>검수 미통과({@code PENDING}·{@code REJECTED}) 자작 제품 — 업로더 본인 또는 ADMIN.
	 *       검수자가 못 보면 검수가 성립하지 않는다
	 * </ul>
	 *
	 * <p><b>{@code source = CATALOG}에는 검수 규칙을 걸지 않는다</b> — 운영진 등록 에셋은 즉시
	 * {@code APPROVED}지만(erd.md {@code asset} 절) 책상·모니터처럼 절차 생성이라 에셋 행이 아예 없는
	 * 제품도 있어서(D18), 검수 상태를 카탈로그 제품의 노출 조건으로 쓰면 그쪽이 통째로 사라진다.
	 * 카탈로그 노출 축은 {@code status}다.
	 */
	private static void requireVisible(Product product, Long callerUserId, boolean admin) {
		if (admin) {
			return;
		}
		if (product.getStatus() == ProductStatus.HIDDEN) {
			throw new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND);
		}
		if (product.getSource() == ProductSource.USER && isUnderReview(product.getAsset())
				&& !isOwnedBy(product, callerUserId)) {
			throw new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND);
		}
	}

	private static boolean isUnderReview(Asset asset) {
		return asset != null
				&& (asset.getReviewStatus() == ReviewStatus.PENDING
						|| asset.getReviewStatus() == ReviewStatus.REJECTED);
	}

	/**
	 * {@code owner}는 LAZY 프록시지만 식별자 게터는 초기화를 일으키지 않는다 — 추가 SELECT 없이
	 * {@code owner_user_id}만 읽는다.
	 */
	private static boolean isOwnedBy(Product product, Long callerUserId) {
		return callerUserId != null && product.getOwner() != null
				&& callerUserId.equals(product.getOwner().getId());
	}

	/**
	 * {@code includeKey}는 {@code getDetail()}의 {@code admin} 그대로다 — {@code list()}는 공개 목록이라
	 * 관리자 경로가 없으므로 항상 {@code false}를 넘긴다(M4, assetKey 익명 노출 차단).
	 */
	private AssetDetailResponse assetDetail(Asset asset, boolean includeKey) {
		return asset == null
				? null
				: AssetDetailResponse.from(asset, presignPort.presignGet(asset.getAssetKey()), includeKey);
	}

	private static ProductEmitterResponse emitterDetail(ProductEmitter emitter) {
		return emitter == null ? null : ProductEmitterResponse.from(emitter);
	}

	/**
	 * {@code display_order} 오름차순으로 내보낸다 — 컬렉션에 {@code @OrderBy}가 없어 DB가 돌려주는
	 * 순서는 보장되지 않는데, 상세 갤러리의 순서가 요청마다 흔들리면 안 된다. 같은 순서값이 둘이면
	 * id로 갈라 결정적으로 만든다.
	 */
	private List<ProductImageDetailResponse> imageDetails(List<ProductImage> images) {
		return images.stream()
				.sorted(Comparator.comparingInt(ProductImage::getDisplayOrder)
						.thenComparing(ProductImage::getId))
				.map(image -> ProductImageDetailResponse.from(
						image, publicImageUrl.url(image.getImageKey())))
				.toList();
	}

	/**
	 * 목록 페이지 전용 — 대표 이미지 1장만 배치 조회로 뽑아 왔으므로(제품당 최대 1장) {@link #imageDetails}
	 * 대신 이 헬퍼가 배열로 감싼다. 대표 이미지가 없으면 빈 배열이다(같은 규칙).
	 */
	private List<ProductImageDetailResponse> primaryImageDetail(ProductImage image) {
		return image == null
				? List.of()
				: List.of(ProductImageDetailResponse.from(image, publicImageUrl.url(image.getImageKey())));
	}

	/**
	 * VESA 태깅. <b>{@code widthMm} → {@code heightMm} 오름차순으로 고정한다</b> — 정션 컬렉션에
	 * {@code @OrderBy}가 없어 DB가 돌려주는 순서는 보장되지 않는데({@link #imageDetails}와 같은 사정)
	 * 호환성 판정의 입력이 요청마다 흔들리면 안 된다. 태깅이 없으면 빈 배열이다.
	 */
	private static List<VesaSpecResponse> vesaSpecs(List<ProductVesa> vesas) {
		return vesas.stream()
				.map(ProductVesa::getVesaSpec)
				.sorted(Comparator.comparingInt(VesaSpec::getWidthMm)
						.thenComparingInt(VesaSpec::getHeightMm))
				.map(VesaSpecResponse::from)
				.toList();
	}

	// --- 규격 서브타입 → 응답 ---

	private static DeskSpecRequest deskSpec(Desk desk) {
		return new DeskSpecRequest(desk.getWidthMm(), desk.getDepthMm(), desk.getHeightMm(),
				desk.getTopThicknessMm(), desk.getEdgeThicknessMm(), desk.isRounded(),
				desk.getDeskTexture().getId(), desk.getFrameType(), desk.getAllowedLoadG());
	}

	private static MonitorSpecRequest monitorSpec(Monitor monitor) {
		return new MonitorSpecRequest(monitor.getDiagonalInch(), monitor.getAspectWidth(),
				monitor.getAspectHeight(), monitor.getBezelMm(), monitor.getPanelThicknessMm(),
				monitor.getPanelShape(), monitor.getCurvatureRadiusMm(), monitor.getStandDepthMm(),
				monitor.isStandDetachable(), monitor.isPivotSupported(), monitor.getSwivelMaxDeg(),
				monitor.getHeightAdjustRangeMm(), monitor.getTiltMinDeg(), monitor.getTiltMaxDeg(),
				monitor.getWeightG(), monitor.getPorts());
	}

	private static ArmSpecRequest armSpec(Arm arm) {
		ArmMounting mounting = arm.getMounting();
		return new ArmSpecRequest(arm.getArmKind(), arm.getArmType(), arm.getDeviceCapacity(),
				arm.getSegmentCount(), arm.getPoleHeightMm(), arm.getReachMinMm(), arm.getReachMaxMm(),
				arm.getHeightMinMm(), arm.getHeightMaxMm(),
				mounting.clamp(), mounting.grommet(), mounting.wall(),
				arm.getClampMinMm(), arm.getClampMaxMm(), arm.getTiltMinDeg(), arm.getTiltMaxDeg(),
				arm.getSwivelRangeDeg(), arm.getPivotRangeDeg(), arm.isVesaPlateDetachable(),
				arm.isHasCableManagement(), arm.getAllowedLoadG());
	}

	private static LightSpecRequest lightSpec(Light light) {
		return new LightSpecRequest(light.getWidthMm(), light.getDepthMm(), light.getHeightMm(),
				light.isColorTemperatureAdjustable(), light.getColorTemperatureMinK(),
				light.getColorTemperatureMaxK(), light.isBrightnessAdjustable(),
				light.getLuminousFluxMinLm(), light.getLuminousFluxMaxLm(), light.getDistribution(),
				light.getReachMm());
	}

	private static PropSpecRequest propSpec(Prop prop) {
		return new PropSpecRequest(prop.getWidthMm(), prop.getDepthMm(), prop.getHeightMm(),
				prop.getWeightG(), prop.isStackable(), prop.getMountSurface());
	}
}
