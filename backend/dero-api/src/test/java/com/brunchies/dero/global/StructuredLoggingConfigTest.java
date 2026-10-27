package com.brunchies.dero.global;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * 운영 프로파일이 ECS 구조화 로깅을 켜 두고 있는지 본다(ADR-0020 결정 1·2).
 *
 * <p><b>prod 프로파일을 띄우지 않고 파일을 직접 읽는다.</b> 이 설정은 {@code prod}에만 있어서
 * 어떤 테스트 컨텍스트도 로드하지 않고, 그래서 CI가 통째로 못 잡는다 — 지워지거나 오타가 나도
 * 초록불이고 <b>배포한 뒤 Kibana에 아무것도 안 들어오는 것으로만</b> 드러난다. prod 전용 설정이
 * 배포에서만 죽은 전례가 이미 세 번 있다.
 *
 * <p>이 줄이 없으면 로그는 평문 한 줄로 나가고, Filebeat은 그걸 통째로 {@code message}에 넣는다 —
 * 레벨·logger로 거를 수 없고, {@code log.logger}로 스트림을 가르는 라우팅
 * ({@code docs/context/observability.md} §6)이 성립하지 않는다.
 */
class StructuredLoggingConfigTest {

	private static final String PROD_YAML = "application-prod.yaml";

	@Test
	@DisplayName("운영 프로파일이 ECS 구조화 로깅을 켜 둔다")
	void prodProfileEnablesEcsStructuredLogging() throws IOException {
		assertThat(prodProperty("logging.structured.format.console"))
				.as("Boot 4.1 내장 ECS JSON. 값이 바뀌면 Filebeat이 필드를 못 가른다")
				.isEqualTo("ecs");
	}

	@Test
	@DisplayName("스택 트레이스 출력 설정이 붙어 있다")
	void prodProfileConfiguresStackTraceOutput() throws IOException {
		// 스택 트레이스는 예외 원인의 유일한 증거다(architecture.md 규칙 9). 상한만 걸고 root=first를
		// 빼면, 잘린 스택에서 정작 원인 예외가 사라진다.
		assertThat(prodProperty("logging.structured.json.stacktrace.root")).isEqualTo("first");
		assertThat(prodProperty("logging.structured.json.stacktrace.max-length")).isNotNull();
	}

	private Object prodProperty(String key) throws IOException {
		ClassPathResource resource = new ClassPathResource(PROD_YAML);
		assertThat(resource.exists()).as(PROD_YAML + "이 클래스패스에 있어야 한다").isTrue();

		List<PropertySource<?>> sources =
				new YamlPropertySourceLoader().load(PROD_YAML, resource);
		return sources.stream()
				.map(source -> source.getProperty(key))
				.filter(value -> value != null)
				.findFirst()
				.orElse(null);
	}
}
