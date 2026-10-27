package com.brunchies.dero.global.search;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 검색어 이벤트 한 줄 — <b>이 클래스의 이름이 곧 수집 경로다</b>(ADR-0020 결정 7).
 *
 * <p>ES ingest pipeline({@code dero-log-routing})이 {@code log.logger}가
 * {@code ...search.SearchEventLogger}로 끝나는 문서만 {@code search-events-*}(ILM 1년)로 보내고
 * 나머지는 {@code app-logs-*}(30일)로 보낸다. <b>패키지나 클래스 이름을 바꾸면
 * {@code observability/elasticsearch/bootstrap-log-indices.sh}의 라우팅 조건도 같이 바꿔야 한다</b> —
 * 안 바꾸면 검색어 이벤트가 조용히 앱 로그로 섞여 들어가 30일 뒤 지워진다. 그래서 전용 클래스가
 * 하나 있는 것이고, {@code ProductSearchService}에서 그냥 찍지 않는다.
 * 회귀 가드는 {@code SearchEventRoutingTest}다.
 *
 * <p><b>검색 대상 도메인마다 로거를 새로 두지 않는다</b> — 제품·배치·게시글이 모두 이 하나를 부르고
 * 무엇을 검색했는지는 {@link SearchIndex} 필드로 가른다. 클래스를 도메인마다 쪼개면 위 라우팅 조건도
 * 도메인마다 늘어나고, 그중 하나만 빠뜨리면 그 도메인 검색어만 조용히 앱 로그로 샌다. 그래서
 * 제품 패키지 밖 {@code global}에 있다.
 *
 * <p><b>값은 다섯뿐이고 넷은 여기서 싣는다</b> — 검색 대상·검색어·결과 건수·userId(내부 숫자 id,
 * 비로그인 {@code null}). 타임스탬프는 ECS JSON의 {@code @timestamp}가 이미 채운다.
 * <b>이메일·토큰·IP는 싣지 않는다</b>(ADR-0020 결정 4·7) — ES에 1년 남으므로 한 번의 실수가 영구
 * 유출이다.
 *
 * <p><b>메시지 문자열이 아니라 key-value로 싣는다.</b> 대시보드 둘 다 검색어별
 * {@code terms} 집계라(0건 검색어 · 인기 검색어) 검색어가 <b>필드</b>여야 한다 — 포맷 문자열에
 * 끼워 넣으면 {@code message} 텍스트 한 덩어리가 되어 집계할 수 있는 것이 없다. SLF4J
 * {@code addKeyValue}는 Boot 4.1 ECS 포맷터가 JSON 멤버로 펴 주고(MDC와 같은 자리),
 * <b>MDC와 달리 숫자가 숫자로 남는다</b> — {@code search.result_count}에 {@code range}·{@code : 0}
 * 질의를 걸 수 있는 이유다.
 */
@Slf4j
@Component
public class SearchEventLogger {

	/**
	 * 필드 이름은 <b>Kibana 대시보드·ES 매핑과 공유하는 계약</b>이다. 상수로 둔 이유는 세 곳이 갈리면
	 * 패널이 에러 없이 그냥 비기 때문이다({@code bootstrap-dashboards.sh} 주석과 같은 함정).
	 */
	public static final String INDEX_FIELD = "search.index";

	public static final String QUERY_FIELD = "search.query";

	public static final String RESULT_COUNT_FIELD = "search.result_count";

	public static final String USER_ID_FIELD = "search.user_id";

	/**
	 * @param index 무엇을 검색했는지. 대시보드가 이걸로 가르지 않으면 제품 인기 검색어와 게시글
	 *        인기 검색어가 한 표에 섞인다
	 * @param query 사용자가 친 검색어. 앞뒤 공백은 떼고 싣는다 — 안 떼면 {@code "모니터 "}와
	 *        {@code "모니터"}가 집계에서 다른 항목으로 갈린다
	 * @param resultCount 노출 규칙까지 적용한 <b>실제로 보여 준</b> 결과 수. ES 히트 수가 아니다 —
	 *        0건 검색어는 "카탈로그 구멍 목록"이라(결정 7) 숨김·검수 대기로 걸러진 것도 0건이 맞다
	 * @param userId 로그인 사용자의 내부 숫자 id. 비로그인이면 {@code null}
	 */
	public void searched(SearchIndex index, String query, long resultCount, Long userId) {
		log.atInfo()
				.addKeyValue(INDEX_FIELD, index.fieldValue())
				.addKeyValue(QUERY_FIELD, query.trim())
				.addKeyValue(RESULT_COUNT_FIELD, resultCount)
				.addKeyValue(USER_ID_FIELD, userId)
				.log("검색");
	}
}
