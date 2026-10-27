package com.brunchies.dero;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

/**
 * Postgres에 <b>Redis까지</b> 붙이는 통합 테스트 베이스 — 상상도 큐(ADR-0015)를 만지는 테스트만
 * 여기를 상속한다.
 *
 * <p>Redis 컨테이너를 {@link AbstractPostgresIntegrationTest}에 올리지 <b>않았다</b>: 큐를 안 쓰는
 * 수십 개 통합 테스트에 컨테이너 기동 비용을 물릴 이유가 없다.
 *
 * <p>{@code @ServiceConnection}을 안 쓴다 — Boot 4.1의 {@code spring-boot-testcontainers}에 Redis용
 * {@code ConnectionDetailsFactory}가 없다(jar 내용 확인). 그래서 접속 정보를 직접 심는다.
 *
 * <p>컨테이너는 부모와 같은 이유로 <b>싱글턴</b>이다 — {@code @Container}를 쓰면 테스트 클래스가
 * 끝날 때 멈춰서, 상속 클래스가 둘 이상이면 두 번째부터 죽은 포트를 붙든다.
 */
public abstract class AbstractRedisIntegrationTest extends AbstractPostgresIntegrationTest {

	static final GenericContainer<?> REDIS =
			new GenericContainer<>("redis:8-alpine").withExposedPorts(6379);

	static {
		REDIS.start();
	}

	@DynamicPropertySource
	static void redisProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.data.redis.host", REDIS::getHost);
		registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
	}
}
