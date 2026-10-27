package com.brunchies.dero;

import java.nio.file.Path;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.images.builder.ImageFromDockerfile;
import org.testcontainers.utility.DockerImageName;

/**
 * Postgres에 <b>Elasticsearch까지</b> 붙이는 통합 테스트 베이스 — 제품 검색(ADR-0019)을 만지는
 * 테스트만 여기를 상속한다.
 *
 * <p><b>공식 이미지가 아니라 레포의 {@code observability/elasticsearch/Dockerfile}을 그대로 빌드해
 * 띄운다.</b> Nori 없이 돌리면 인덱스 생성부터 실패하고, 무엇보다 이 ADR이 ES를 고른 이유(띄어쓰기
 * 불일치를 형태소 분석으로 흡수)를 검증할 수 없다. 배포가 쓰는 Dockerfile과 같은 파일이라 플러그인
 * 설치가 깨지면 테스트가 먼저 빨개진다.
 *
 * <p>이미지는 고정 태그로 굽고 {@code deleteOnExit=false}라 <b>다음 실행부터는 캐시 히트</b>다 —
 * 첫 실행만 플러그인 내려받는 시간이 든다.
 *
 * <p>Dockerfile 경로가 상대 경로인 것은 Gradle 테스트의 작업 디렉터리가 {@code backend/dero-api}로
 * 고정돼 있기 때문이다(backend/CLAUDE.md — 모든 명령이 그 폴더에서 돈다).
 *
 * <p>컨테이너는 부모와 같은 이유로 <b>싱글턴</b>이다 — {@code @Container}를 쓰면 테스트 클래스가
 * 끝날 때 멈춰서, 상속 클래스가 둘 이상이면 두 번째부터 죽은 포트를 붙든다.
 */
public abstract class AbstractElasticsearchIntegrationTest extends AbstractPostgresIntegrationTest {

	private static final String IMAGE_TAG = "dero-elasticsearch:9.4.2-nori-test";
	private static final Path DOCKERFILE =
			Path.of("..", "..", "observability", "elasticsearch", "Dockerfile")
					.toAbsolutePath().normalize();

	static final ElasticsearchContainer ELASTICSEARCH;

	static {
		String image = new ImageFromDockerfile(IMAGE_TAG, false).withDockerfile(DOCKERFILE).get();
		ELASTICSEARCH = new ElasticsearchContainer(DockerImageName.parse(image)
				.asCompatibleSubstituteFor("docker.elastic.co/elasticsearch/elasticsearch"))
				// 운영과 같은 선택이다(compose.observability.yaml) — 인증을 켜면 테스트가 인증서까지
				// 다루게 되는데, 그것은 이 테스트가 보려는 것이 아니다.
				.withEnv("xpack.security.enabled", "false")
				// 테스트용이라 힙을 줄인다. 운영은 2g(ADR-0020 §2).
				.withEnv("ES_JAVA_OPTS", "-Xms512m -Xmx512m");
		ELASTICSEARCH.start();
	}

	@DynamicPropertySource
	static void elasticsearchProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.elasticsearch.uris", AbstractElasticsearchIntegrationTest::httpUri);
	}

	/** Testcontainers 버전에 따라 스킴이 붙어 오기도 하고 {@code host:port}만 오기도 한다. */
	private static String httpUri() {
		String address = ELASTICSEARCH.getHttpHostAddress();
		return address.startsWith("http") ? address : "http://" + address;
	}
}
