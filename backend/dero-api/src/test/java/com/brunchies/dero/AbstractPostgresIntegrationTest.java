package com.brunchies.dero;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 영속성 통합 테스트 공통 베이스 — 진짜 Postgres를 띄운다(H2 금지: JSONB 컬럼 때문).
 *
 * <p>컨테이너를 <b>싱글턴</b>으로 띄운다 — {@code @Testcontainers} + {@code @Container}를 쓰면 JUnit
 * 확장이 <b>테스트 클래스가 끝날 때 컨테이너를 멈춘다.</b> 상속하는 클래스가 둘 이상이면 첫 클래스가 끝난 순간
 * 컨테이너가 죽고, 캐시된 스프링 컨텍스트는 죽은 포트를 붙들어 다음 클래스가 전부
 * {@code Connection refused}로 깨진다(2026-07-28 실측). static 초기화로 한 번 띄우고 멈추지 않으면
 * JVM 종료 시 Ryuk이 걷어간다.
 *
 * <p>컨텍스트가 올라오는 것 자체가 {@code ddl-auto: validate} 게이트다 — Flyway가 V1 baseline을 적용한
 * 스키마와 엔티티 매핑이 어긋나면 여기서 죽는다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
public abstract class AbstractPostgresIntegrationTest {

	@ServiceConnection
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

	static {
		POSTGRES.start();
	}
}
