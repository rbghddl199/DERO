package com.brunchies.dero;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * V8 백필(확장)과 V9 잔여 백필 검증 — 기존 배치의 {@code theme_key}가 이관 매핑표(ADR-0030,
 * {@code .scratch/DERO-502-room-surface/spec.md} "이관 매핑")대로 벽면 3행 + 바닥으로
 * 풀리는지를 <b>진짜 마이그레이션 실행</b>으로 본다.
 *
 * <p>스프링 컨텍스트의 Flyway는 빈 DB에 전체를 한 번에 적용해 백필이 0행이라 이 계약을 못 본다 —
 * 그래서 싱글턴 컨테이너에 <b>별도 DB를 만들어 V7까지 적용 → 구형 데이터 삽입 → V8 적용</b>
 * 순서로 운영 이관과 같은 경로를 밟는다. 매핑이 한 칸이라도 어긋나면 기존 배치가 다른 방으로
 * 열린다(무회귀 조건).
 */
class PlacementWallBackfillMigrationTest {

	@Test
	@DisplayName("V8이 기존 배치마다 벽면 3행을 만들고 이관 매핑표와 정확히 일치한다")
	void 이관_매핑() throws Exception {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		String url = "jdbc:postgresql://" + postgres.getHost() + ":"
				+ postgres.getMappedPort(5432) + "/v8_backfill";

		try (Connection admin = DriverManager.getConnection(
						postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
				Statement statement = admin.createStatement()) {
			statement.execute("DROP DATABASE IF EXISTS v8_backfill");
			statement.execute("CREATE DATABASE v8_backfill");
		}

		Flyway.configure()
				.dataSource(url, postgres.getUsername(), postgres.getPassword())
				.target("7")
				.load()
				.migrate();

		try (Connection connection = DriverManager.getConnection(
						url, postgres.getUsername(), postgres.getPassword());
				Statement statement = connection.createStatement()) {
			statement.execute("""
					INSERT INTO placement
						(title, theme_key, is_wall_left_on, is_wall_front_on, is_wall_right_on)
					VALUES
						('중립', 'neutral', true, true, false),
						('오크', 'oak-warm', true, true, true),
						('화이트', 'white-clean', false, true, true),
						('다크', 'dark-studio', true, false, false),
						('미상', 'custom-x', true, true, false)
					""");
		}

		Flyway.configure()
				.dataSource(url, postgres.getUsername(), postgres.getPassword())
				.load()
				.migrate();

		try (Connection connection = DriverManager.getConnection(
						url, postgres.getUsername(), postgres.getPassword());
				Statement statement = connection.createStatement()) {

			// 배치 5 × 3면 = 15행, 창문은 전부 없음(기존 배치가 시각적으로 같게 열린다).
			assertThat(queryLong(statement, "select count(*) from placement_wall")).isEqualTo(15L);
			assertThat(queryLong(statement,
					"select count(*) from placement_wall where has_window")).isZero();
			assertThat(queryLong(statement,
					"select count(*) from placement where time_of_day <> 'DAY'")).isZero();

			// (계열 변형, 표시 여부)를 면별로 편다 — 이관 매핑표 그대로여야 한다.
			Map<String, String> walls = wallFinishes(statement);
			assertThat(walls).containsEntry("중립/LEFT", "PAINT NEUTRAL on")
					.containsEntry("중립/FRONT", "PAINT NEUTRAL on")
					.containsEntry("중립/RIGHT", "PAINT NEUTRAL off")
					.containsEntry("오크/LEFT", "WOOD_SLAT OAK on")
					.containsEntry("오크/FRONT", "WOOD_SLAT OAK on")
					.containsEntry("오크/RIGHT", "PAINT WARM_GRAY on")
					.containsEntry("화이트/LEFT", "PAINT WHITE off")
					.containsEntry("화이트/FRONT", "WOOD_SLAT ASH on")
					.containsEntry("화이트/RIGHT", "PAINT WHITE on")
					.containsEntry("다크/LEFT", "PAINT CHARCOAL on")
					.containsEntry("다크/FRONT", "PAINT CHARCOAL off")
					.containsEntry("다크/RIGHT", "PAINT CHARCOAL off")
					// 미상 키는 neutral과 같게 접는다 — 프론트의 PAINT 기본 변형 폴백과 같은 판단.
					.containsEntry("미상/LEFT", "PAINT NEUTRAL on")
					.containsEntry("미상/RIGHT", "PAINT NEUTRAL off");

			Map<String, String> floors = floorFinishes(statement);
			assertThat(floors).containsEntry("중립", "WOOD OAK")
					.containsEntry("오크", "WOOD OAK")
					.containsEntry("화이트", "WOOD LIGHT_OAK")
					.containsEntry("다크", "WOOD WALNUT")
					.containsEntry("미상", "WOOD OAK");
		}
	}

	@Test
	@DisplayName("V9가 벽면 행 없는 배치만 같은 매핑으로 채운다 — 이미 채워진 배치는 안 건드린다")
	void 잔여_백필() throws Exception {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		String url = "jdbc:postgresql://" + postgres.getHost() + ":"
				+ postgres.getMappedPort(5432) + "/v9_contract";

		try (Connection admin = DriverManager.getConnection(
						postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
				Statement statement = admin.createStatement()) {
			statement.execute("DROP DATABASE IF EXISTS v9_contract");
			statement.execute("CREATE DATABASE v9_contract");
		}

		migrateTo(url, "7");

		// V8 이전부터 있던 배치 — V8이 벽면 3행을 만든다.
		execute(url, """
				INSERT INTO placement
					(title, theme_key, is_wall_left_on, is_wall_front_on, is_wall_right_on)
				VALUES ('이전', 'white-clean', true, true, true)
				""");

		migrateTo(url, "8");

		// V8 이후 blue-green 창: 옛 WAS가 만든 배치라 placement_wall이 0행이다.
		// 그리고 '이전' 배치의 바닥은 사용자가 새 UI로 바꿔 뒀다 — V9가 되돌리면 안 된다.
		execute(url, """
				INSERT INTO placement
					(title, theme_key, is_wall_left_on, is_wall_front_on, is_wall_right_on)
				VALUES ('창중', 'oak-warm', true, false, true);
				UPDATE placement SET floor_variant = 'WALNUT' WHERE title = '이전';
				""");

		migrateTo(url, null);

		try (Connection connection = DriverManager.getConnection(
						url, postgres.getUsername(), postgres.getPassword());
				Statement statement = connection.createStatement()) {

			// 배치 2 × 3면 = 6행 — 이미 행이 있던 배치를 다시 채우면 유니크 제약이 터지거나
			// (터지지 않더라도) 사용자가 고른 마감이 기본값으로 덮인다.
			assertThat(queryLong(statement, "select count(*) from placement_wall")).isEqualTo(6L);

			Map<String, String> walls = wallFinishes(statement);
			assertThat(walls).containsEntry("창중/LEFT", "WOOD_SLAT OAK on")
					.containsEntry("창중/FRONT", "WOOD_SLAT OAK off")
					.containsEntry("창중/RIGHT", "PAINT WARM_GRAY on")
					// V8이 이미 채운 배치는 그대로다.
					.containsEntry("이전/FRONT", "WOOD_SLAT ASH on");

			Map<String, String> floors = floorFinishes(statement);
			assertThat(floors).containsEntry("창중", "WOOD OAK")
					// 사용자가 바꾼 바닥을 theme_key로 되돌리지 않는다.
					.containsEntry("이전", "WOOD WALNUT");

			// 옛 4컬럼은 아직 살아 있다 — DROP은 다음 배포의 V10이다(옛 색 WAS가 아직 읽는다).
			assertThat(queryLong(statement, """
					select count(*) from information_schema.columns
					where table_name = 'placement'
						and column_name in ('theme_key', 'is_wall_left_on', 'is_wall_front_on',
							'is_wall_right_on')
					""")).isEqualTo(4L);
		}
	}

	private void migrateTo(String url, String target) {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		var configuration = Flyway.configure()
				.dataSource(url, postgres.getUsername(), postgres.getPassword());
		if (target != null) {
			configuration.target(target);
		}
		configuration.load().migrate();
	}

	private void execute(String url, String sql) throws Exception {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		try (Connection connection = DriverManager.getConnection(
						url, postgres.getUsername(), postgres.getPassword());
				Statement statement = connection.createStatement()) {
			statement.execute(sql);
		}
	}

	private long queryLong(Statement statement, String sql) throws Exception {
		try (ResultSet rs = statement.executeQuery(sql)) {
			rs.next();
			return rs.getLong(1);
		}
	}

	private Map<String, String> wallFinishes(Statement statement) throws Exception {
		Map<String, String> bySide = new HashMap<>();
		try (ResultSet rs = statement.executeQuery("""
				select p.title, w.wall_side, w.material, w.variant, w.is_on
				from placement_wall w join placement p on p.id = w.placement_id
				""")) {
			while (rs.next()) {
				bySide.put(rs.getString(1) + "/" + rs.getString(2),
						rs.getString(3) + " " + rs.getString(4)
								+ (rs.getBoolean(5) ? " on" : " off"));
			}
		}
		return bySide;
	}

	private Map<String, String> floorFinishes(Statement statement) throws Exception {
		Map<String, String> byTitle = new HashMap<>();
		try (ResultSet rs = statement.executeQuery(
				"select title, floor_material, floor_variant from placement")) {
			while (rs.next()) {
				byTitle.put(rs.getString(1), rs.getString(2) + " " + rs.getString(3));
			}
		}
		return byTitle;
	}
}
