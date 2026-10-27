package com.brunchies.dero.global.search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.mapping.Property;
import co.elastic.clients.elasticsearch.indices.get_mapping.IndexMappingRecord;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 기동 시 {@code search-events-*} 스트림의 {@code search.query}가 {@code keyword}인지 본다
 * (DERO-495). {@code ProductSearchService.prepareIndex}가 제품 인덱스에 하는 것과 같은 종류의
 * 기동 검증이고, 이쪽은 <b>고치지 않고 알리기만 한다</b> — 복구가 스트림 삭제라 데이터가 지워지기
 * 때문이다(아래).
 *
 * <p><b>왜 필요한가</b>(387 배포 실측, 2026-08-07): EC2의 {@code ~/dero/observability/}를 Jenkins가
 * 안 건드려서, 백엔드는 새 판인데 부트스트랩 스크립트는 옛 판인 상태가 만들어진다. 그 상태로 돌리면
 * {@code dero-search-events-fields} 컴포넌트 템플릿이 안 생기고, 첫 이벤트가 도착하면서 ES가
 * <b>동적 매핑</b>으로 스트림을 만든다({@code search.query}가 {@code text} + {@code .keyword}).
 * 그러면 대시보드가 {@code search.query}로 {@code terms} 집계를 거는데 <b>에러도 안 나고 패널만
 * 빈다</b> — 배포 직후에는 아무 신호가 없고 며칠 뒤 "대시보드가 비었다"로만 드러난다.
 *
 * <p><b>인덱스 템플릿은 인덱스를 만드는 순간에만 적용된다.</b> 나중에 템플릿을 넣어도 이미 만들어진
 * 백킹 인덱스는 옛 매핑 그대로라, 고치려면 스트림을 지웠다 다시 만드는 수밖에 없고 <b>그 안에 든
 * 검색어가 같이 사라진다.</b> 배포 직후(유실 0)에 알아채는 것과 한 달 뒤에 알아채는 것의 값이 다르다
 * — 이 검증이 사는 이유가 그 차이다.
 *
 * <p><b>부팅은 무슨 일이 있어도 계속한다</b>(ADR-0019 결정 6과 같은 결). ES가 안 떠 있어도 카탈로그·
 * 상세·배치는 Postgres라 전부 살아 있고, 여기서 예외를 흘리면 ES 하나 때문에 백엔드가 통째로 못 뜬다.
 * <b>스트림이 아직 없는 상태도 정상이다</b> — 첫 검색 전에는 데이터 스트림 자체가 없다.
 *
 * <p><b>이 클래스는 검색어 이벤트가 아니라 앱 로그로 간다.</b> ingest pipeline은 logger 이름이
 * {@code ...search.SearchEventLogger}로 끝나는 문서만 {@code search-events-*}로 보내므로(ADR-0020
 * 결정 7), 같은 패키지에 있어도 이쪽 로그는 {@code app-logs-*}에 남는다 — 의도한 자리다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SearchEventMappingGuard {

	/** 데이터 스트림 이름은 {@code search-events-default}이고, 조회는 백킹 인덱스로 펼쳐진다. */
	private static final String INDEX_PATTERN = "search-events-*";

	private static final String DATA_STREAM = "search-events-default";

	/**
	 * 매핑은 {@code search} 객체 아래 {@code query}로 중첩된다 — ES가 문서의 점 표기 키를 색인 시점에
	 * 펼치기 때문이다. <b>이름을 {@link SearchEventLogger}의 상수에서 쪼개 온다</b>: 두 곳에 적으면
	 * 필드 이름을 바꾼 날 이 검증만 조용히 엉뚱한 자리를 보게 된다.
	 */
	private static final String QUERY_OBJECT =
			SearchEventLogger.QUERY_FIELD.substring(0, SearchEventLogger.QUERY_FIELD.indexOf('.'));

	private static final String QUERY_LEAF =
			SearchEventLogger.QUERY_FIELD.substring(SearchEventLogger.QUERY_FIELD.indexOf('.') + 1);

	/**
	 * 로그에 그대로 싣는 복구 절차(`docs/context/observability.md` §6의 그 명령).
	 *
	 * <p><b>명령을 로그에 박아 두는 것이 이 클래스의 값의 절반이다.</b> "매핑이 틀렸다"만 남기면
	 * 읽는 사람이 문서를 찾아야 하고, 이 함정은 애초에 문서를 안 읽어서 걸리는 종류다.
	 */
	private static final String RECOVERY = """
			복구 절차 —
			  1) 스크립트를 최신으로 올린다(Jenkins가 안 건드린다):
			     git archive origin/main observability | ssh -i ~/.ssh/<키>.pem ubuntu@<호스트> 'tar -x -C ~/dero'
			  2) 최신인지 확인한다(0이면 옛 판이다):
			     grep -c dero-search-events-fields ~/dero/observability/elasticsearch/bootstrap-log-indices.sh
			  3) 템플릿을 만든다(멱등):
			     ./observability/elasticsearch/bootstrap-log-indices.sh
			  4) 스트림을 다시 만든다 — 안에 든 검색어가 같이 지워진다:
			     curl -s -XDELETE 'localhost:9200/_data_stream/%s'
			  5) 다시 확인한다(query가 keyword여야 한다):
			     curl -s 'localhost:9200/%s/_mapping' | grep -o '"query":{[^}]*}'"""
			.formatted(DATA_STREAM, INDEX_PATTERN);

	private final ElasticsearchClient elasticsearch;

	@EventListener(ApplicationReadyEvent.class)
	public void verifySearchEventMapping() {
		try {
			Map<String, IndexMappingRecord> live = elasticsearch.indices()
					.getMapping(mapping -> mapping.index(INDEX_PATTERN).ignoreUnavailable(true))
					.mappings();

			List<String> broken = live.entrySet().stream()
					.filter(entry -> !hasKeywordQuery(entry.getValue()))
					.map(Map.Entry::getKey)
					.sorted()
					.toList();

			if (!broken.isEmpty()) {
				log.error("""
						검색어 이벤트 매핑이 잘못됐습니다 — {}가 keyword가 아니라 Kibana의 terms 집계가 \
						에러 없이 빈 패널만 돌려줍니다. 부트스트랩 스크립트가 낡은 채로 돌아 ES가 동적 \
						매핑으로 스트림을 만들었을 때 이렇게 됩니다: indices={}
						{}""", SearchEventLogger.QUERY_FIELD, broken, RECOVERY);
			}
		} catch (IOException | ElasticsearchException e) {
			// ES가 없거나 못 붙는 상태다 — 검색만 죽고 나머지는 산다(ADR-0019 결정 6). 던지지 않는다.
			log.warn("검색어 이벤트 매핑을 확인하지 못했습니다 — ES 기동 후 직접 봅니다: "
					+ "curl -s 'localhost:9200/{}/_mapping'", INDEX_PATTERN, e);
		}
	}

	/**
	 * {@code search.query}가 {@code keyword}인가. <b>필드가 아예 없어도 거짓이다</b> — 컴포넌트
	 * 템플릿이 안 붙은 스트림이 정확히 그 모습이고, 대시보드가 비는 결과도 같다.
	 */
	private boolean hasKeywordQuery(IndexMappingRecord index) {
		Property search = index.mappings().properties().get(QUERY_OBJECT);
		if (search == null || !search.isObject()) {
			return false;
		}
		Property query = search.object().properties().get(QUERY_LEAF);
		return query != null && query.isKeyword();
	}
}
