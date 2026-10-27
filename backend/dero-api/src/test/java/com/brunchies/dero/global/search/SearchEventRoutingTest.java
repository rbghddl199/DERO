package com.brunchies.dero.global.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 검색어 이벤트가 앱 코드 · ES 부트스트랩 · Kibana 대시보드 셋에 걸친 <b>문자열 계약</b>을 지키는지
 * 본다(ADR-0020 결정 7).
 *
 * <p><b>이 계약이 깨지면 아무것도 빨개지지 않는다.</b> logger 이름이 갈리면 검색어가 조용히 앱 로그
 * 스트림으로 섞여 30일 뒤 지워지고, 필드 이름이 갈리면 Kibana 패널이 에러 없이 그냥 빈다 — 둘 다
 * <b>배포하고 며칠 뒤 "대시보드에 아무것도 없다"로만</b> 드러난다. 그래서 인프라 스크립트를 파일로
 * 직접 읽는다({@code StructuredLoggingConfigTest}가 prod yaml을 읽는 것과 같은 이유).
 *
 * <p>스크립트는 클래스패스 밖이라 <b>모듈 루트({@code backend/dero-api}) 기준 상대 경로</b>로 읽는다 —
 * Gradle 테스트의 작업 디렉터리다.
 */
class SearchEventRoutingTest {

	private static final Path REPO_ROOT = Path.of("..", "..");
	private static final Path BOOTSTRAP_INDICES =
			REPO_ROOT.resolve("observability/elasticsearch/bootstrap-log-indices.sh");
	private static final Path BOOTSTRAP_DASHBOARDS =
			REPO_ROOT.resolve("observability/kibana/bootstrap-dashboards.sh");

	@Test
	@DisplayName("ingest pipeline의 라우팅 접미사가 SearchEventLogger의 실제 이름과 같다")
	void 라우팅_접미사가_클래스_이름과_같다() throws IOException {
		// 파이프라인 조건은 endsWith("search.SearchEventLogger")다 — 패키지를 통째로 적지 않는 이유는
		// 스크립트 안에서 이스케이프된 JSON 문자열이라 짧을수록 읽기 쉬워서다.
		String suffix = "search.SearchEventLogger";

		assertThat(SearchEventLogger.class.getName())
				.as("클래스를 옮기면 이 접미사도 같이 옮겨야 한다")
				.endsWith(suffix);
		assertThat(read(BOOTSTRAP_INDICES))
				.as("ES ingest pipeline이 이 접미사로 search-events-* 스트림을 가른다")
				.contains(suffix);
	}

	@Test
	@DisplayName("ES 매핑과 Kibana 패널이 SearchEventLogger가 싣는 필드 이름을 쓴다")
	void 필드_이름이_세_곳에서_같다() throws IOException {
		String indices = read(BOOTSTRAP_INDICES);
		String dashboards = read(BOOTSTRAP_DASHBOARDS);

		// 매핑 쪽은 `search` 객체 아래 중첩이라 마지막 마디만 확인한다.
		assertThat(indices).contains("\"index\"", "\"query\"", "\"result_count\"", "\"user_id\"");

		// 대시보드는 점 표기 그대로 쓴다 — 집계 필드와 KQL 조건 양쪽.
		assertThat(dashboards)
				.as("인기 검색어·0건 검색어 두 패널이 집계하는 필드")
				.contains(SearchEventLogger.QUERY_FIELD);
		assertThat(dashboards)
				.as("0건 검색어 패널의 KQL 조건")
				.contains(SearchEventLogger.RESULT_COUNT_FIELD + ": 0");
	}

	@Test
	@DisplayName("검색 대상 값은 색인 별칭과 같은 소문자 복수형이다")
	void 검색_대상_값이_소문자다() {
		assertThat(SearchIndex.PRODUCTS.fieldValue()).isEqualTo("products");
		assertThat(SearchIndex.PLACEMENTS.fieldValue()).isEqualTo("placements");
		assertThat(SearchIndex.POSTS.fieldValue()).isEqualTo("posts");
	}

	private String read(Path path) throws IOException {
		assertThat(Files.exists(path)).as(path + "이 있어야 한다").isTrue();
		return Files.readString(path);
	}
}
