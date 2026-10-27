package com.brunchies.dero.product.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.Refresh;
import co.elastic.clients.elasticsearch._types.query_dsl.Operator;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.CompletionSuggestOption;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.core.search.Suggestion;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.dto.ProductReindexResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * 제품 검색 인덱스 — 질의(읽기)와 색인(쓰기)을 한 클래스가 소유한다(ADR-0019).
 *
 * <p><b>ES가 돌려주는 것은 제품 id 목록뿐이다</b>(결정 4). 이름·가격·규격은 Postgres가 정본이라
 * {@link ProductCatalogService}가 그 id로 상세를 다시 읽는다 — ES 문서에 표시값을 실어 두면 색인이
 * 한 번 밀린 순간 화면이 조용히 옛 값을 보여준다(D7 "메쉬-규격 분리"와 같은 결).
 *
 * <p><b>노출 규칙(숨김·검수·소프트 삭제)도 ES가 판정하지 않는다.</b> 색인은 살아 있는 제품 전량이고,
 * 걸러내기는 id로 다시 읽는 Postgres 쿼리가 한다({@code ProductRepository.findCatalogByIds}) — 규칙이
 * 두 벌이면 어느 쪽이 맞는지 판정할 수단이 없다.
 *
 * <p><b>애플리케이션은 별칭 {@code products}만 안다</b>(결정 5). 실체는
 * {@code products_v<타임스탬프>}이고 {@link #reindexAll()}이 새 인덱스를 채운 뒤 별칭만 스왑한다 —
 * 매핑·사용자 사전이 바뀔 때마다 오는 재색인을 무중단으로 만드는 것이 목적이다. 폴백이 없으므로
 * (결정 6) 인덱스를 지웠다 다시 만드는 동안의 공백은 그대로 서비스 장애가 된다.
 *
 * <p><b>Nori 사용자 사전은 브랜드 테이블에서 굽는다</b>(결정 2) — 손으로 관리하는 사전은 브랜드가
 * 늘 때 조용히 낡는다. 사전이 없으면 {@code 라이트크래프트}가 {@code [라이트, 크래프트]}로 쪼개져
 * {@code 라이트}(조명) 검색에 엉뚱한 브랜드 제품이 전부 걸린다. <b>공백이 든 브랜드명은 뺀다</b> —
 * Nori 사전의 한 줄은 {@code <복합어> <구성어>...} 형식이라 {@code "삼성 전자"}를 그대로 실으면
 * "삼성을 전자로 분해하라"는 뜻이 된다. 애초에 공백은 토크나이저가 이미 끊으므로 사전이 필요 없다.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ProductSearchService {

	/** 애플리케이션이 아는 유일한 이름. 실체 인덱스는 이 별칭 뒤에 숨는다(결정 5). */
	public static final String ALIAS = "products";

	private static final String INDEX_PREFIX = "products_v";
	/**
	 * 실체 인덱스 이름의 꼬리. <b>밀리초까지 찍는다</b> — 초 단위로 자르면 같은 초에 재색인을 두 번
	 * 부른 순간 {@code resource_already_exists_exception}으로 두 번째가 통째로 실패한다
	 * (2026-08-06 실측, 연속 실행되는 통합 테스트에서 재현).
	 */
	private static final DateTimeFormatter INDEX_SUFFIX =
			DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");
	private static final String INDEX_DEFINITION = "elasticsearch/product-index.json";

	/**
	 * 사용자 사전을 꽂는 자리. 정의 파일의 이 문자열을 그대로 찾아 바꾸므로 <b>파일과 이 상수가
	 * 갈리면 색인 생성이 실패해야 한다</b>({@link #indexDefinition()}가 던진다) — 조용히 사전 없는
	 * 인덱스가 만들어지면 브랜드명 오분해를 아무도 눈치채지 못한다.
	 */
	private static final String USER_DICTIONARY_PLACEHOLDER = "\"user_dictionary_rules\": []";

	/**
	 * 한 질의가 ES에서 받아 오는 id 상한. 카탈로그가 수십~수백 제품이라(ADR-0019 실측 제약) 이
	 * 한 번의 조회에 사실상 전량이 들어오고, 그래서 규격·카테고리 필터와 페이지 자르기를 Postgres와
	 * 애플리케이션이 맡을 수 있다.
	 *
	 * <p>ponytail: 카탈로그가 수천이 되면 이 방식이 깨진다 — 그때는 ES 문서에 필터 필드
	 * (규격·카테고리)를 넣고 페이징까지 ES에서 한다. 지금 그 필드를 넣으면 정본이 두 곳이 된다.
	 */
	private static final int MAX_HITS = 200;

	/** 본검색 가중치. 형태소 일치가 접두 일치보다 앞선다 — 접두는 타이핑 중 후보를 채우는 용도다. */
	private static final float NAME_BOOST = 3.0f;

	/** 드롭다운에 세우는 추천어 개수. 더 길면 목록이 화면을 덮고 고르는 것보다 읽는 게 오래 걸린다. */
	public static final int MAX_SUGGESTIONS = 10;

	/**
	 * FST에서 받아 오는 후보 수 — 세우려는 개수의 두 배다. <b>후보 중 일부는 화면에 못 간다</b>:
	 * 숨김·검수 대기 제품이 Postgres에서 걸러지고(결정 4) 이름이 같은 제품은 하나로 합쳐진다.
	 * 딱 {@link #MAX_SUGGESTIONS}개만 받으면 그만큼 드롭다운이 짧아진다.
	 */
	private static final int SUGGESTION_CANDIDATES = MAX_SUGGESTIONS * 2;

	/** 응답에서 이 이름으로 결과를 찾는다. ES는 한 요청에 여러 suggester를 담을 수 있어 이름이 키다. */
	private static final String SUGGESTER_NAME = "product-name";

	/** {@code product-index.json}의 completion 필드. 이름과 갈리면 추천어가 통째로 0건이 된다. */
	private static final String SUGGEST_FIELD = "suggest";

	private final ElasticsearchClient elasticsearch;
	private final ProductRepository products;
	private final BrandRepository brands;
	private final CategoryRepository categories;
	private final ObjectMapper objectMapper;

	/**
	 * 부팅 시 인덱스를 쓸 수 있는 상태로 만든다 — 별칭이 없으면 새로 만들고, <b>매핑이 낡았으면
	 * 전량 재색인한다.</b> 새로 뜬 서버가 재색인 버튼을 누르기 전까지 503만 뱉는 상태를 없앤다.
	 *
	 * <p><b>매핑 검사가 있는 이유</b>: ES 매핑은 나중에 필드를 더할 수 없고(결정 5), 배포로 정의
	 * 파일에 필드가 늘어도 이미 떠 있는 인덱스는 옛 매핑 그대로다. 그 상태에서 새 필드를 쓰는 질의는
	 * 400이 되어 <b>배포 직후부터 손으로 재색인을 누를 때까지 그 기능만 503</b>이다 — 2026-08-07
	 * {@code suggest}(completion) 필드를 더하면서 실제로 생긴 상황이다. 여기서 알아서 재색인하므로
	 * 매핑을 바꾸는 사람이 배포 절차를 따로 기억할 필요가 없다. <b>필드 이름을 비교하므로 새 필드가
	 * 늘어도 이 코드는 그대로다</b>(같은 이름으로 타입만 바꾸는 경우는 못 잡는다 — 그때는 재색인
	 * 버튼이 여전히 답이다).
	 *
	 * <p><b>실패해도 부팅은 계속된다.</b> ES는 검색 전용이고 카탈로그·상세·배치는 Postgres라 전부
	 * 산다(결정 6) — 여기서 예외를 흘리면 ES가 안 뜬 EC2에서 백엔드까지 못 뜬다. 관측은 로그가
	 * 맡는다.
	 */
	@EventListener(ApplicationReadyEvent.class)
	public void prepareIndex() {
		try {
			if (!elasticsearch.indices().existsAlias(a -> a.name(ALIAS)).value()) {
				String index = createIndex();
				swapAlias(index);
				log.info("검색 인덱스를 새로 만들었습니다: index={} alias={}", index, ALIAS);
				return;
			}
			Set<String> missing = missingMappedFields();
			if (!missing.isEmpty()) {
				log.info("검색 인덱스 매핑이 낡아 전량 재색인합니다: missingFields={}", missing);
				reindexAll();
			}
		} catch (IOException | ElasticsearchException e) {
			log.error("검색 인덱스를 준비하지 못했습니다 — 검색 API가 503입니다. "
					+ "ES 기동 후 POST /api/v1/admin/search/reindex로 복구합니다.", e);
		}
	}

	/** 정의 파일에는 있는데 살아 있는 인덱스에는 없는 최상위 필드들. 비어 있으면 매핑이 최신이다. */
	private Set<String> missingMappedFields() throws IOException {
		Set<String> live = elasticsearch.indices().getMapping(mapping -> mapping.index(ALIAS))
				.mappings().values().stream()
				.flatMap(record -> record.mappings().properties().keySet().stream())
				.collect(Collectors.toSet());

		Set<String> defined = new LinkedHashSet<>(objectMapper.readTree(indexDefinition())
				.get("mappings").get("properties").propertyNames());

		defined.removeAll(live);
		return defined;
	}

	/**
	 * 질의어에 걸린 제품 id를 <b>관련도 순서 그대로</b> 돌려준다. 호출부가 이 순서대로 Postgres에서
	 * 상세를 읽고 노출 규칙을 적용한다.
	 *
	 * <p>세 필드를 {@code should}로 묶는다 — {@code name}(Nori)이 띄어쓰기 불일치를,
	 * {@code name.autocomplete}(edge n-gram)가 타이핑 중의 부분어와 오타를, {@code categoryPath}가
	 * <b>제품 이름에 없는 분류어</b>를 잡는다(결정 1의 요구 ②③ + ADR-0029).
	 *
	 * <p><b>{@code categoryPath} 절만 {@code AND}인 데도 이유가 있다.</b> 이 필드는 조상 이름 몇 개짜리
	 * 짧은 문자열이라 {@code OR}로 두면 조각 하나가 맞은 카테고리 <b>전량</b>이 딸려 온다 — 이름 일치가
	 * 아니라 분류 일치라 걸리는 문서 수가 애초에 크다. 관련도는 본검색의 {@link #NAME_BOOST}가 지킨다:
	 * 이름이 맞은 제품이 항상 위고, 분류만 맞은 제품은 그 아래에 붙는다.
	 *
	 * <p><b>두 절의 {@code operator}가 다른 데는 실측 근거가 있다.</b> 본검색은 {@code AND}다 —
	 * 여러 단어를 친 질의에 하나만 맞아도 걸리면 관련 없는 결과가 쏟아진다. 접두 절은 기본값
	 * {@code OR}인데, <b>한국어 오타는 형태소 분석 결과를 통째로 바꾸기 때문이다</b>: {@code 모니타}는
	 * Nori가 {@code [모니, 타, 하, 다]}로 분해해서(2026-08-06 실측) {@code 모니터}와 토큰 단위
	 * 편집거리가 성립하지 않는다 — {@code fuzziness=AUTO}로도 안 걸린다. {@code OR}이면 {@code 모니}
	 * 하나가 맞아 잡힌다. 그 대신 접두 절은 관련도가 낮으므로 본검색에 {@link #NAME_BOOST}를 줘서
	 * 정확히 맞은 제품이 위로 온다. 회귀 가드는 {@code ProductSearchPersistenceTest.오타}.
	 *
	 * <p><b>{@code NEVER}는 장식이 아니다</b>(DERO-387 후속). 이 메서드는 DB를 한 줄도 안 읽고
	 * <b>네트워크 왕복만</b> 한다 — 트랜잭션 안에서 불리면 그 왕복 내내 커넥션 하나가 아무 일도 안 하면서
	 * 풀에서 사라진다. 폴백이 없어(결정 6) ES가 느려지는 날 그 지연이 그대로 커넥션 보유 시간이 되고,
	 * 마르는 것은 검색이 아니라 <b>관계없는 API 전부</b>다. {@code NOT_SUPPORTED}가 아닌 이유는
	 * {@code GeneratedImageService.publish}와 같다 — 중단된 트랜잭션은 자기 커넥션을 계속 쥐고 있어
	 * 막으려던 점거가 조용히 부활한다. {@code NEVER}면 예외로 터진다.
	 *
	 * @throws BusinessException ES가 죽었거나 인덱스가 없으면 503이다. <b>폴백하지 않는다</b>
	 *         (결정 6) — 조용한 폴백은 ES가 3일째 죽어 있어도 아무도 모르게 만든다.
	 */
	@Transactional(propagation = Propagation.NEVER)
	public List<Long> searchIds(String query) {
		String text = query.trim();
		try {
			SearchResponse<Void> response = elasticsearch.search(search -> search
					.index(ALIAS)
					.size(MAX_HITS)
					.source(source -> source.fetch(false))
					.query(q -> q.bool(bool -> bool
							.should(should -> should.match(match -> match
									.field("name")
									.query(text)
									.fuzziness("AUTO")
									.operator(Operator.And)
									.boost(NAME_BOOST)))
							.should(should -> should.match(match -> match
									.field("name.autocomplete")
									.query(text)))
							.should(should -> should.match(match -> match
									.field("categoryPath")
									.query(text)
									.operator(Operator.And)))
							.minimumShouldMatch("1"))),
					Void.class);

			return response.hits().hits().stream().map(Hit::id).map(Long::valueOf).toList();
		} catch (IOException | ElasticsearchException e) {
			log.error("제품 검색에 실패했습니다: query={}", text, e);
			throw new BusinessException(ProductErrorCode.PRODUCT_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 추천어 후보 제품 id를 <b>FST가 정한 순서 그대로</b> 돌려준다(결정 1의 요구 ③).
	 *
	 * <p><b>여기도 id만 돌려준다</b>(결정 4). completion suggester는 매치된 <b>입력 문자열</b>을 함께
	 * 주지만 그걸 그대로 드롭다운에 세우면 안 된다 — ES 색인은 살아 있는 제품 전량이라
	 * <b>숨김·검수 대기 제품의 이름이 그대로 노출되고</b>, 눌러 봐야 결과가 0건이다. 호출부가 이 id로
	 * Postgres를 다시 읽어 본검색과 같은 노출 술어를 적용한다({@code ProductCatalogService.suggest}).
	 *
	 * <p><b>본검색과 다른 자료구조다.</b> {@code name.autocomplete}(edge n-gram)는 역색인 위의 매치라
	 * 결과 목록을 채우고, 이쪽은 메모리에 올라간 별도 FST라 키 입력마다 때려도 싸다. 그래서 하나는
	 * 목록을, 하나는 입력창 아래 추천어를 맡는다.
	 *
	 * <p><b>{@code NEVER}인 이유는 {@link #searchIds}와 같고, 이쪽이 더 급하다</b> — 키 입력마다 오는
	 * 호출이라 트랜잭션 안에 있으면 타이핑 한 줄이 커넥션 여러 개를 동시에 문다.
	 *
	 * @throws BusinessException {@link #searchIds}와 같다 — ES가 답하지 못하면 503이고 폴백은 없다.
	 */
	@Transactional(propagation = Propagation.NEVER)
	public List<Long> suggestIds(String query) {
		String text = query.trim();
		try {
			SearchResponse<Void> response = elasticsearch.search(search -> search
					// 추천어는 hits를 안 쓴다 — 0으로 두면 본검색 쿼리가 통째로 안 돈다.
					.index(ALIAS)
					.size(0)
					.source(source -> source.fetch(false))
					.suggest(suggest -> suggest.suggesters(SUGGESTER_NAME, suggester -> suggester
							.prefix(text)
							.completion(completion -> completion
									.field(SUGGEST_FIELD)
									// 같은 표면형이 여러 제품에 걸릴 때 FST 단계에서 한 번만 올린다.
									.skipDuplicates(true)
									.size(SUGGESTION_CANDIDATES)))),
					Void.class);

			List<Suggestion<Void>> suggestions = response.suggest().get(SUGGESTER_NAME);
			if (suggestions == null) {
				return List.of();
			}
			return suggestions.stream()
					.flatMap(suggestion -> suggestion.completion().options().stream())
					.map(CompletionSuggestOption::id)
					.filter(Objects::nonNull)
					.map(Long::valueOf)
					.distinct()
					.toList();
		} catch (IOException | ElasticsearchException e) {
			log.error("추천어 조회에 실패했습니다: query={}", text, e);
			throw new BusinessException(ProductErrorCode.PRODUCT_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 전량 재색인 — 새 인덱스를 만들어 채운 뒤 별칭을 스왑하고 옛 인덱스를 지운다(결정 3·5).
	 *
	 * <p>이벤트 색인이 실패해도(ES 다운·네트워크) 이 한 번으로 복구된다. <b>수백 건 전량 재색인이
	 * 몇 초</b>라는 사실이 유실 추적 인프라 없이 유실을 감당하는 설계를 성립시킨다 — 규모가 바뀌면
	 * 판단도 바뀐다(ADR-0019 대안 절).
	 *
	 * @return 색인한 제품 수
	 */
	public ProductReindexResponse reindexAll() {
		List<Product> rows = products.findAllByDeletedAtIsNull();
		String created = null;
		try {
			String index = createIndex();
			created = index;
			if (!rows.isEmpty()) {
				bulkIndex(index, rows);
			}
			// 별칭을 넘기기 전에 새 인덱스를 검색 가능 상태로 만든다 — refresh 없이 스왑하면
			// 스왑 직후 1초 남짓 동안 검색이 0건을 돌려준다.
			elasticsearch.indices().refresh(refresh -> refresh.index(index));
			swapAlias(index);
			log.info("전량 재색인 완료: index={} count={}", index, rows.size());
			return new ProductReindexResponse(rows.size());
		} catch (IOException | ElasticsearchException e) {
			// 별칭이 아직 옛 인덱스를 가리키므로 검색은 멀쩡하다. 대신 반쯤 채워진 새 인덱스가
			// 아무에게도 안 붙은 채 디스크만 먹으므로 걷어낸다 — 재시도할 때마다 하나씩 쌓인다.
			deleteQuietly(created);
			log.error("전량 재색인에 실패했습니다.", e);
			throw new BusinessException(ProductErrorCode.PRODUCT_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 제품 1건 색인 — 등록·수정 커밋 후에 불린다({@code ProductSearchIndexListener}).
	 *
	 * <p><b>여기서 던지지 않는다.</b> 커밋은 이미 끝났고 색인 실패로 관리자 요청을 실패시킬 수 없다.
	 * 유실은 재색인이 걷어낸다(결정 3).
	 *
	 * <p>{@code refresh=wait_for}는 <b>등록 직후 검색이 그 제품을 찾게 하려는 것</b>이다. ES 기본
	 * 새로고침 주기가 1초라, 없으면 관리자가 등록하자마자 검색해 보고 "안 들어갔다"고 판단한다.
	 * 대가는 이 호출이 다음 새로고침까지 최대 1초 기다리는 것 — 관리자 쓰기 경로라 감당한다.
	 */
	public void index(Product product) {
		try {
			List<String> categoryPath = categoryPath(product, categoriesById());
			elasticsearch.index(request -> request
					.index(ALIAS)
					.id(String.valueOf(product.getId()))
					.refresh(Refresh.WaitFor)
					.document(ProductDocument.of(product, categoryPath)));
		} catch (IOException | ElasticsearchException e) {
			log.error("제품 색인에 실패했습니다 — 재색인으로 복구합니다: productId={}", product.getId(), e);
		}
	}

	/** 색인에서 제거 — 소프트 삭제된 제품이 검색 상한 자리를 차지하지 않게 한다. {@link #index}와 같은 이유로 던지지 않는다. */
	public void remove(Long productId) {
		try {
			elasticsearch.delete(request -> request
					.index(ALIAS)
					.id(String.valueOf(productId))
					.refresh(Refresh.WaitFor));
		} catch (IOException | ElasticsearchException e) {
			log.error("제품 색인 제거에 실패했습니다 — 재색인으로 복구합니다: productId={}", productId, e);
		}
	}

	private String createIndex() throws IOException {
		String index = INDEX_PREFIX + OffsetDateTime.now().format(INDEX_SUFFIX);
		String definition = indexDefinition();
		elasticsearch.indices().create(create -> create
				.index(index)
				.withJson(new StringReader(definition)));
		return index;
	}

	private void bulkIndex(String index, List<Product> rows) throws IOException {
		// 카테고리 마스터는 수십 행짜리 작은 표라 한 번 읽어 메모리에서 조상을 거슬러 오른다 —
		// 제품마다 부모 사슬을 로드하면 전량 재색인이 그대로 N+1이 된다.
		Map<Long, Category> categoriesById = categoriesById();
		BulkRequest.Builder bulk = new BulkRequest.Builder();
		for (Product product : rows) {
			List<String> categoryPath = categoryPath(product, categoriesById);
			bulk.operations(operation -> operation.index(document -> document
					.index(index)
					.id(String.valueOf(product.getId()))
					.document(ProductDocument.of(product, categoryPath))));
		}

		BulkResponse response = elasticsearch.bulk(bulk.build());
		if (response.errors()) {
			// 부분 실패를 성공으로 넘기면 "재색인했는데 안 나온다"가 된다 — 통째로 실패시킨다.
			// 옛 별칭은 아직 그대로라 이 시점에 검색은 멀쩡하다.
			throw new IOException("벌크 색인에 실패한 문서가 있습니다: index=" + index);
		}
	}

	/**
	 * 별칭을 새 인덱스로 옮기고 옛 인덱스를 지운다. 붙이기와 떼기를 한 요청에 담아야 <b>별칭이
	 * 어디에도 안 붙은 순간</b>이 생기지 않는다.
	 */
	private void swapAlias(String index) throws IOException {
		Set<String> previous = aliasedIndices();

		elasticsearch.indices().updateAliases(update -> {
			previous.forEach(old -> update.actions(action ->
					action.remove(remove -> remove.index(old).alias(ALIAS))));
			return update.actions(action -> action.add(add -> add.index(index).alias(ALIAS)));
		});

		for (String old : previous) {
			elasticsearch.indices().delete(delete -> delete.index(old));
		}
	}

	/**
	 * 별칭이 가리키는 인덱스들. <b>아직 아무 인덱스도 없으면 빈 집합이다</b> — ES는 없는 별칭 조회에
	 * 404를 주고, {@code ignore_unavailable}은 인덱스에만 걸리지 별칭에는 안 걸린다(2026-08-06 실측:
	 * {@code alias [products] missing}으로 첫 색인이 통째로 실패했다).
	 */
	private Set<String> aliasedIndices() throws IOException {
		try {
			return elasticsearch.indices().getAlias(alias -> alias.name(ALIAS)).aliases().keySet();
		} catch (ElasticsearchException e) {
			// 404는 "첫 색인"이라는 정상 상태다. 나머지 오류는 그대로 올린다.
			if (e.status() == HttpStatus.NOT_FOUND.value()) {
				return Set.of();
			}
			throw e;
		}
	}

	/** 실패 경로의 뒷정리 — 이미 다른 예외를 던지는 중이라 여기서 더 던지지 않는다. */
	private void deleteQuietly(String index) {
		if (index == null) {
			return;
		}
		try {
			elasticsearch.indices().delete(delete -> delete.index(index));
		} catch (IOException | ElasticsearchException e) {
			log.warn("실패한 재색인 인덱스를 지우지 못했습니다 — 손으로 지웁니다: index={}", index, e);
		}
	}

	/** 정의 파일을 읽어 브랜드 사용자 사전을 꽂는다. */
	private String indexDefinition() throws IOException {
		String definition;
		try (InputStream in = new ClassPathResource(INDEX_DEFINITION).getInputStream()) {
			definition = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		if (!definition.contains(USER_DICTIONARY_PLACEHOLDER)) {
			// 정의 파일과 이 클래스의 상수가 갈렸다는 뜻이다. 사전 없는 인덱스를 조용히 만드는 대신
			// 색인 자체를 실패시킨다 — 호출부가 이 예외를 503으로 번역하고 로그를 남긴다.
			throw new IOException(
					INDEX_DEFINITION + "에 " + USER_DICTIONARY_PLACEHOLDER + " 자리가 없습니다.");
		}
		String rules = objectMapper.writeValueAsString(brandDictionaryRules());
		return definition.replace(USER_DICTIONARY_PLACEHOLDER, "\"user_dictionary_rules\": " + rules);
	}

	/** 조상 사슬을 거슬러 오르려고 카테고리 마스터를 통째로 읽는다 — 수십 행짜리 표다. */
	private Map<Long, Category> categoriesById() {
		return categories.findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc().stream()
				.collect(Collectors.toMap(Category::getId, category -> category));
	}

	/**
	 * 제품이 달린 카테고리와 그 <b>조상 전부</b>의 이름(ADR-0029 결정 1).
	 *
	 * <p><b>잎 이름만으로는 안 된다.</b> 제품은 소분류에 달리는데 사용자는 대분류 단어를 친다 —
	 * {@code 스피커}에 달린 제품이 {@code 음향}으로 안 나오던 것이 이 티켓의 발단이다
	 * (2026-08-07 운영 실측 0건).
	 *
	 * <p>{@code parent}는 LAZY지만 {@code getId()}만 보므로 프록시를 깨우지 않는다
	 * ({@code CategoryService.selfAndDescendantIds}와 같은 판단). <b>이미 본 id를 다시 만나면
	 * 멈춘다</b> — 부모 순환은 {@code AdminCategoryService}가 막지만, 막지 못한 데이터가 한 건이라도
	 * 있으면 여기가 영영 안 끝나는 자리다(색인 한 건이 서버를 멈춘다).
	 */
	private List<String> categoryPath(Product product, Map<Long, Category> categoriesById) {
		List<String> path = new ArrayList<>();
		Set<Long> visited = new LinkedHashSet<>();
		Long cursor = product.getCategory().getId();
		while (cursor != null && visited.add(cursor)) {
			Category category = categoriesById.get(cursor);
			if (category == null) {
				// 소프트 삭제된 카테고리에 달린 제품이다 — 거기서 경로가 끊긴다.
				break;
			}
			path.add(category.getName());
			cursor = category.getParent() == null ? null : category.getParent().getId();
		}
		return path;
	}

	private List<String> brandDictionaryRules() {
		return brands.findAllByDeletedAtIsNull().stream()
				.map(brand -> brand.getName().trim())
				.filter(name -> !name.isEmpty() && !name.contains(" "))
				.distinct()
				.toList();
	}

	/**
	 * ES 문서. <b>담기는 값은 검색어가 맞아야 하는 것뿐이다</b> — 화면에 나가는 값은 Postgres가 정본이라
	 * 여기 실을 이유가 없고, 실으면 색인이 밀렸을 때 화면이 조용히 옛 값을 보여준다(결정 4).
	 * {@code suggest}도 새 값이 아니라 {@code name}에서 굽는 색인 자료고, {@code categoryPath}는
	 * 카테고리 트리에서 굽는다(ADR-0029) — <b>화면에 세우지 않는다.</b>
	 */
	public record ProductDocument(String name, List<String> categoryPath, List<String> suggest) {

		static ProductDocument of(Product product, List<String> categoryPath) {
			return new ProductDocument(product.getName(), categoryPath,
					suggestInputs(product.getName()));
		}

		/**
		 * completion suggester에 넣을 입력들 — <b>전체 이름과 어절 단위 접미사 전부</b>다.
		 *
		 * <p>FST는 <b>첫 토큰부터 시작하는 접두</b>만 매치한다. 그래서 입력이 이름 하나뿐이면
		 * {@code 모니터 암}은 {@code 모니}로는 뜨지만 {@code 암}으로는 안 뜬다 — 사용자가 이름 중간
		 * 단어를 치는 것은 흔한 일이라({@code LG 울트라기어 …}에서 {@code 울트라}) 그 자리가 통째로
		 * 비면 드롭다운이 있으나 마나다. 접미사를 같이 실으면 {@code 암}이 자기 입력의 접두가 된다.
		 *
		 * <p>어절 수만큼 늘지만 제품 이름은 몇 어절짜리 문자열이고 카탈로그는 수백 건이라
		 * (ADR-0019 실측 제약) FST 크기는 문제가 되지 않는다.
		 */
		private static List<String> suggestInputs(String name) {
			String[] words = name.trim().split("\\s+");
			return IntStream.range(0, words.length)
					.mapToObj(from -> String.join(" ", Arrays.copyOfRange(words, from, words.length)))
					.filter(input -> !input.isEmpty())
					.distinct()
					.toList();
		}
	}
}
