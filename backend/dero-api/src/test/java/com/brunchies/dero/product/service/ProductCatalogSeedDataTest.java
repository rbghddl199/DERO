package com.brunchies.dero.product.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import java.math.BigDecimal;
import java.sql.Connection;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/**
 * {@code db/seed/product-catalog-seed.sql}(REQ-SIM-06 카탈로그 시딩, ADR-0006 결정 9 — Flyway 밖)이
 * 실제 V1(+V2) 스키마에 NOT NULL·FK·UNIQUE 위반 없이 그대로 들어가는지 검증한다.
 *
 * <p>이 스크립트는 Flyway 스캔 대상이 아니라 앱 부팅 경로로는 절대 실행되지 않는다 — 이 테스트가
 * 유일한 자동 검증이다. 실제 로컬 dev DB 적용은 psql로 수동(스크립트 헤더 주석 참고).
 *
 * <p><b>시드는 반드시 테스트 트랜잭션 커넥션에서 실행한다</b>({@link DataSourceUtils#getConnection}).
 * 컨테이너는 스위트 전체가 공유하는 싱글턴이라({@link AbstractPostgresIntegrationTest}) 여기서 커밋한
 * 행은 <b>이후 모든 테스트 클래스에 그대로 남는다.</b> 예전엔 {@code dataSource.getConnection()} +
 * {@code autoCommit(true)}로 커밋했고 "명시적 id라 PK 충돌이 없다"는 근거를 달아 뒀다 — 그 근거가 본
 * 것은 PK뿐이고 <b>자연키 유니크 인덱스를 못 봤다.</b> 남은 {@code vesa_spec (950, 75, 75)}·
 * {@code (951, 100, 100)} 때문에 {@code ProductCatalogServicePersistenceTest}가 같은 규격을 만들 때
 * {@code uq_vesa_spec_width_mm_height_mm} 위반으로 죽었다(2026-08-01). 그 클래스만 단독으로 돌리면
 * 통과해서 원인을 자기 diff에서 찾게 되는 종류의 실패다. <b>커넥션을 닫지 말 것</b> — 트랜잭션이
 * 소유하고 있고, 닫으면 같은 트랜잭션의 뒤 단언이 커넥션을 잃는다.
 *
 * <p>{@code setval}은 Postgres에서 트랜잭션 밖이라 롤백돼도 시퀀스는 전진한 채 남는다. 무해하고,
 * 마지막 {@code nextval} 단언은 그 성질에 기대고 있다.
 */
class ProductCatalogSeedDataTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	@DisplayName("시딩 스크립트를 실행하면 24개 product와 서브타입·조인 행이 전부 제약 위반 없이 들어간다")
	void 시딩_스크립트_적용() {
		DataSource dataSource = jdbcTemplate.getDataSource();
		Connection connection = DataSourceUtils.getConnection(dataSource);
		ScriptUtils.executeSqlScript(connection,
				new FileSystemResource("db/seed/product-catalog-seed.sql"));

		assertThat(count("product where id between 1000 and 1023")).isEqualTo(24);
		assertThat(count("monitor where product_id in (1000,1001)")).isEqualTo(2);
		assertThat(count("arm where product_id = 1002")).isEqualTo(1);
		assertThat(count("light where product_id in (1003,1004)")).isEqualTo(2);
		assertThat(count("prop where product_id between 1005 and 1023")).isEqualTo(19);
		assertThat(count("product_vesa where product_id in (1000,1001,1002)")).isEqualTo(4);
		assertThat(count("product_emitter where product_id in (1005,1010)")).isEqualTo(2);
		assertThat(count("category where id between 900 and 908")).isEqualTo(9);
		assertThat(count("brand where id between 920 and 929")).isEqualTo(10);

		// 프론트 스펙값이 정확히 옮겨졌는지 대표값 몇 개를 직접 대조한다.
		assertThat(jdbcTemplate.queryForObject(
				"select diagonal_inch from monitor where product_id = 1000", BigDecimal.class))
				.isEqualByComparingTo("27.0");
		assertThat(jdbcTemplate.queryForObject(
				"select curvature_radius_mm from monitor where product_id = 1001", Integer.class))
				.isEqualTo(1800);
		assertThat(jdbcTemplate.queryForObject(
				"select allowed_load_g from arm where product_id = 1002", Integer.class))
				.isEqualTo(5000);
		assertThat(jdbcTemplate.queryForObject(
				"select color_temperature_min_k from light where product_id = 1003", Integer.class))
				.isEqualTo(2700);
		assertThat(jdbcTemplate.queryForObject(
				"select luminous_flux_max_lm from light where product_id = 1004", Integer.class))
				.isEqualTo(560);
		assertThat(jdbcTemplate.queryForObject(
				"select default_color from product_emitter where product_id = 1010", String.class))
				.isEqualTo("#3F6EC2");

		// 시퀀스 방어적 전진이 실제로 앞으로 갔는지 — 다음 nextval이 시딩 최대 id보다 커야 한다.
		assertThat(jdbcTemplate.queryForObject("select nextval('product_id_seq')", Long.class))
				.isGreaterThan(1023L);
	}

	private Integer count(String fromWhere) {
		return jdbcTemplate.queryForObject("select count(*) from " + fromWhere, Integer.class);
	}
}
