package com.brunchies.dero.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * {@code refresh:{userId}} Set 관리를 진짜 Redis로 검증한다(ADR-0005 결정 4).
 *
 * <p>공식 Testcontainers Redis 모듈({@code com.redis:testcontainers-redis})은 의존성에 없다 — 신규
 * 의존성 없이 이미 있는 Testcontainers core의 {@link GenericContainer}만으로 충분해 추가하지 않았다.
 * {@code @ServiceConnection}은 Redis용 자동 인식 팩터리가 없어(Postgres와 달리) {@code
 * @DynamicPropertySource}로 직접 배선한다. Postgres는 {@link AbstractPostgresIntegrationTest}의
 * 싱글턴 컨테이너를 그대로 상속해 datasource를 얻는다({@code @SpringBootTest} 전체 컨텍스트가 뜨려면
 * 필요).
 */
@Testcontainers
class RefreshTokenServiceTest extends AbstractPostgresIntegrationTest {

	@Container
	static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

	static {
		REDIS.start();
	}

	@DynamicPropertySource
	static void redisProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.data.redis.host", REDIS::getHost);
		registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
	}

	@Autowired
	private RefreshTokenService refreshTokenService;

	@Autowired
	private StringRedisTemplate redisTemplate;

	@Test
	@DisplayName("등록된 jti로 회전하면 새 jti로 교체되고 옛 jti는 사라진다")
	void 회전_성공() {
		refreshTokenService.register(2001L, "jti-1");

		boolean rotated = refreshTokenService.rotate(2001L, "jti-1", "jti-2");

		assertThat(rotated).isTrue();
		assertThat(redisTemplate.opsForSet().isMember("refresh:2001", "jti-2")).isTrue();
		assertThat(redisTemplate.opsForSet().isMember("refresh:2001", "jti-1")).isFalse();
	}

	@Test
	@DisplayName("이미 교체되어 사라진 옛 jti로 재시도하면 재사용 탐지 — 세션 전체가 지워지고 false")
	void 재사용_탐지() {
		refreshTokenService.register(2002L, "jti-1");
		refreshTokenService.rotate(2002L, "jti-1", "jti-2");

		boolean rotated = refreshTokenService.rotate(2002L, "jti-1", "jti-3");

		assertThat(rotated).isFalse();
		assertThat(redisTemplate.hasKey("refresh:2002")).isFalse();
	}

	@Test
	@DisplayName("revokeAll은 등록된 세션 키를 통째로 지운다")
	void 전체_폐기() {
		refreshTokenService.register(2003L, "jti-1");

		refreshTokenService.revokeAll(2003L);

		assertThat(redisTemplate.hasKey("refresh:2003")).isFalse();
	}
}
