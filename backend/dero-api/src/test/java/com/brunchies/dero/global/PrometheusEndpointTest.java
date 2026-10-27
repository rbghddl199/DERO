package com.brunchies.dero.global;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Prometheus 스크레이프 엔드포인트가 실제로 열려 있는지 본다(ADR-0020 결정 1).
 *
 * <p>세 가지가 동시에 맞아야 200이 나오고, 하나만 틀려도 <b>조용히 404</b>다 —
 * ① {@code micrometer-registry-prometheus}가 클래스패스에 있다 ② {@code exposure.include}에
 * {@code prometheus}가 있다 ③ 경로가 {@code /api/actuator} 아래다. 404는 예외를 남기지 않으므로
 * 배포 후 Prometheus 타깃이 DOWN인 것으로만 드러난다.
 */
@AutoConfigureMockMvc
class PrometheusEndpointTest extends AbstractPostgresIntegrationTest {

	@Autowired
	MockMvc mockMvc;

	@Test
	@DisplayName("/api/actuator/prometheus가 200으로 JVM·HikariCP 지표를 내놓는다")
	void prometheusEndpointIsExposed() throws Exception {
		mockMvc.perform(get("/api/actuator/prometheus"))
				.andExpect(status().isOk())
				// 대시보드 패널이 쓰는 지표명 그대로다 — 이름이 바뀌면 여기서 먼저 깨진다.
				.andExpect(content().string(containsString("jvm_memory_used_bytes")))
				.andExpect(content().string(containsString("hikaricp_connections_active")));
	}

	@Test
	@DisplayName("대시보드 결정 9 패널이 참조하는 지표가 스크레이프에 전부 들어 있다")
	void minimumMetricSetIsPresent() throws Exception {
		// quantile 시계열은 요청이 한 건이라도 기록된 뒤에 생긴다 — 스크레이프 자신은 응답을 만든 뒤에
		// 기록되므로 먼저 다른 요청을 한 번 때린다. **상태 코드는 절대 단정하지 않는다**: 테스트
		// 프로파일에 Redis 설정이 없어 RedisHealthIndicator가 localhost:6379로 붙으므로 결과가
		// 개발자 로컬 도커 상태에 따라 갈린다 — 로컬 redis 컨테이너가 떠 있으면 200, 없으면
		// 503(redis만 DOWN, db·diskSpace·ssl은 UP)이다. 둘 다 2026-08-05 실측.
		// 여기서 필요한 건 상태가 아니라 "요청 한 건이 계측됐다"는 사실뿐이다.
		mockMvc.perform(get("/api/actuator/health"));

		String scrape = mockMvc.perform(get("/api/actuator/prometheus"))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();

		// ADR-0020 결정 9의 패널이 쓰는 이름·태그다. 지표가 사라지면 대시보드는 조용히 빈 패널이 되므로
		// (Grafana는 없는 지표를 에러로 만들지 않는다) 여기서 먼저 깨뜨린다.
		assertThat(scrape)
				.contains("area=\"nonheap\"")                     // 힙 밖 메모리
				.contains("jvm_buffer_memory_used_bytes")         // direct buffer (S3 SDK)
				.contains("logback_events_total")                 // 에러 로그 발생률
				.contains("hikaricp_connections_timeout_total")   // 커넥션 풀 고갈
				.contains("hikaricp_connections_acquire_seconds_max")
				.contains("quantile=\"0.95\"");                   // application.yaml의 percentiles 설정

		// jvm_gc_pause_seconds는 일부러 안 본다 — GC가 실제로 한 번 일어난 뒤에 등록되므로
		// 테스트 JVM에서 나오는지가 실행마다 갈린다. 켜져 있음은 JvmGcMetrics 자동설정이 보장한다.
	}

	@Test
	@DisplayName("노출 목록에 없는 액추에이터 엔드포인트는 여전히 404다")
	void otherActuatorEndpointsStayClosed() throws Exception {
		mockMvc.perform(get("/api/actuator/env")).andExpect(status().isNotFound());
		mockMvc.perform(get("/api/actuator/beans")).andExpect(status().isNotFound());
	}
}
