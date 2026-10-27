package com.brunchies.dero.global.search;

import static org.assertj.core.api.Assertions.assertThat;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.Refresh;
import com.brunchies.dero.AbstractElasticsearchIntegrationTest;
import java.io.IOException;
import java.io.StringReader;
import java.time.OffsetDateTime;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * 매핑 기동 검증(DERO-495)을 <b>진짜 ES에</b> 대고 본다.
 *
 * <p>이 검증이 막으려는 사고는 슬라이스로 재현할 수 없다 — 옛 부트스트랩 스크립트가 돌아 컴포넌트
 * 템플릿이 없는 상태에서 첫 이벤트가 도착하면 <b>ES가 동적 매핑으로</b> {@code search.query}를
 * {@code text}로 잡는다는 사실 자체가 ES의 동작이다. 그래서 여기서는 템플릿을 일부러 빼고 문서를
 * 한 건 넣어 그 상태를 실제로 만든다.
 *
 * <p>로그 단언은 {@code OutputCaptureExtension}으로 한다 — {@code LoggerFactory} 캐스팅 +
 * {@code ListAppender}는 {@code .claude/rules/java/architecture.md} §9가 금지한 줄과 글자 그대로
 * 같아서 다음 사람이 규칙 위반으로 읽는다({@code GlobalExceptionHandlerTest}와 같은 판단).
 */
@ExtendWith(OutputCaptureExtension.class)
class SearchEventMappingGuardTest extends AbstractElasticsearchIntegrationTest {

	private static final String INDEX_PATTERN = "search-events-*";
	private static final String DATA_STREAM = "search-events-default";
	private static final String TEMPLATE = "search-events";

	/** 운영 부트스트랩과 같은 형태({@code bootstrap-log-indices.sh}의 컴포넌트 템플릿). */
	private static final String KEYWORD_MAPPING = """
			{
			  "properties": {
			    "search": {
			      "properties": {
			        "index":        { "type": "keyword" },
			        "query":        { "type": "keyword", "ignore_above": 256 },
			        "result_count": { "type": "long" },
			        "user_id":      { "type": "long" }
			      }
			    }
			  }
			}""";

	@Autowired
	private SearchEventMappingGuard guard;

	@Autowired
	private ElasticsearchClient elasticsearch;

	@AfterEach
	void cleanUp() {
		deleteQuietly(() -> elasticsearch.indices().deleteDataStream(d -> d.name(DATA_STREAM)));
		deleteQuietly(() -> elasticsearch.indices().deleteIndexTemplate(t -> t.name(TEMPLATE)));
	}

	@Test
	@DisplayName("동적 매핑으로 만들어진 스트림이면 복구 명령까지 에러로 남긴다")
	void 옛_매핑이면_에러(CapturedOutput output) throws IOException {
		putTemplate(null);
		indexEvent();

		guard.verifySearchEventMapping();

		assertThat(output).contains("검색어 이벤트 매핑이 잘못됐습니다");
		assertThat(output).as("어느 백킹 인덱스가 잘못됐는지 이름이 나와야 한다")
				.contains(".ds-" + DATA_STREAM);
		assertThat(output).as("복구 명령이 로그에 있어야 한다 — 이 함정은 문서를 안 읽어서 걸린다")
				.contains("bootstrap-log-indices.sh")
				.contains("_data_stream/" + DATA_STREAM);
	}

	@Test
	@DisplayName("keyword로 매핑된 스트림에서는 조용하다")
	void 정상_매핑이면_조용하다(CapturedOutput output) throws IOException {
		putTemplate(KEYWORD_MAPPING);
		indexEvent();

		guard.verifySearchEventMapping();

		assertThat(output).doesNotContain("검색어 이벤트 매핑이 잘못됐습니다");
	}

	@Test
	@DisplayName("스트림이 아직 없는 상태는 정상이라 아무것도 안 남긴다")
	void 스트림이_없으면_조용하다(CapturedOutput output) {
		guard.verifySearchEventMapping();

		assertThat(output).doesNotContain("검색어 이벤트 매핑");
	}

	/** {@code mappings}가 {@code null}이면 매핑 없는 템플릿 — 첫 문서가 동적 매핑을 만든다. */
	private void putTemplate(String mappings) throws IOException {
		elasticsearch.indices().putIndexTemplate(template -> {
			template.name(TEMPLATE).indexPatterns(INDEX_PATTERN).dataStream(stream -> stream);
			if (mappings != null) {
				template.template(body -> body.mappings(m -> m.withJson(new StringReader(mappings))));
			}
			return template;
		});
	}

	/**
	 * 검색어 이벤트 한 건. <b>데이터 스트림은 {@code op_type=create}만 받고 문서 id를 못 준다</b>
	 * — 그래서 단건 색인 API가 아니라 벌크의 create 연산으로 넣는다.
	 */
	private void indexEvent() throws IOException {
		elasticsearch.bulk(bulk -> bulk
				.refresh(Refresh.True)
				.operations(operation -> operation.create(create -> create
						.index(DATA_STREAM)
						.document(Map.of(
								"@timestamp", OffsetDateTime.now().toString(),
								"search", Map.of("query", "모니터", "result_count", 3))))));
	}

	private void deleteQuietly(EsCall call) {
		try {
			call.run();
		} catch (IOException | ElasticsearchException e) {
			// 그 테스트가 만들지 않은 것을 지우려는 경우다 — 뒷정리라 여기서 실패시킬 이유가 없다.
		}
	}

	@FunctionalInterface
	private interface EsCall {

		void run() throws IOException;
	}
}
