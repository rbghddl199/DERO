package com.brunchies.dero;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * V12 재이관 → V13 롤백 → V14 에디터 회귀 검증 — 기존 데스크피드 글이 전량 삭제되고 post 원본
 * 4건(502·552·553·554)이 다시 들어온 뒤, V13이 본문에서 이미지 마크다운을 벗겼다가 <b>V14가 그것을
 * 도로 이어 붙여 마크다운 본문(NOT NULL)으로 되돌리는지</b>를 <b>진짜 마이그레이션 실행</b>으로
 * 본다(DERO-568·579·595, ADR-0034 → ADR-0036 → D34·ADR-0037).
 *
 * <p><b>단언은 체인 끝(V14) 상태를 본다</b>({@code flyway-migration.md} §2: target 없는
 * {@code migrate()}는 뒤에 쓰인 버전까지 적용한다) — V12가 넣은 {@code is_primary}도 V13이 되살린
 * {@code display_order}도 뒤 버전이 걷어 가므로, 중간 상태에 단언을 걸면 체인을 끝까지 적용하는
 * 순간 거짓이 된다.
 *
 * <p><b>V11 마커 이관 검증은 이 파일에서 사라졌다</b> — V12가 {@code desk_feed}를 전량 비우고
 * {@code display_order}를 떨어뜨리므로, V11이 만든 행과 컬럼에 대한 단언은 체인을 끝까지 적용하는
 * 순간 전부 거짓이 된다({@code flyway-migration.md} §2: target 없는 {@code migrate()}는 뒤에 쓰인
 * 버전까지 적용한다). V11의 계약은 V12가 지운 것이라 남겨 둘 자리가 없다.
 *
 * <p>스프링 컨텍스트의 Flyway는 빈 DB에 전체를 한 번에 적용해 이관이 0행이라 이 계약을 못 본다 —
 * 그래서 싱글턴 컨테이너에 별도 DB를 만들어 V11까지 적용 → 구형 데이터 삽입 → V12 적용 순서로
 * 운영 이관과 같은 경로를 밟는다({@code PlacementWallBackfillMigrationTest}와 같은 방식).
 */
class DeskFeedMigrationTest {

	@Test
	@DisplayName("V12가 post 4건을 재이관하고, V13이 벗긴 본문을 V14가 마크다운으로 되돌린다")
	void 재이관() throws Exception {
		String url = createDatabase("v12_desk_feed_parity");
		migrateTo(url, "11");

		execute(url, """
				INSERT INTO "user" (id, email, provider, provider_id, nickname)
				VALUES (1, 'a@dero.life', 'KAKAO', 'kakao-1', '작성자'),
					(2, 'b@dero.life', 'KAKAO', 'kakao-2', '이웃');

				-- V11 구조의 기존 데스크피드 글 — 좋아요·사진까지 달려 있어도 통째로 사라져야 한다.
				INSERT INTO desk_feed (id, user_id, content) VALUES (900, 1, '옛 캡션');
				INSERT INTO desk_feed_image (id, desk_feed_id, image_key, display_order)
				VALUES (901, 900, 'old.png', 0);
				INSERT INTO desk_feed_like (id, user_id, desk_feed_id) VALUES (902, 2, 900);

				-- 재이관 대상 4건. V12가 본문을 그대로 옮기고 V13이 이미지 마크다운을 벗긴다.
				-- 552는 본문이 이미지 한 줄뿐이라 V13이 NULL로 만든다(본문은 선택 입력이다).
				INSERT INTO post (id, user_id, title, content, like_count)
				VALUES (502, 1, '첫 책상', E'본문\\n\\n![사진](post-images/502/a.png)', 7),
					(552, 1, '둘째 책상', '![표지](post-images/552/x.png)', 0),
					(553, 2, '셋째 책상', '본문 셋', 0),
					(554, 2, '넷째 책상', '본문 넷', 0);

				-- 502에만 사진 2장(표지 1장). is_primary가 그대로 옮겨져야 한다.
				INSERT INTO post_image (id, post_id, image_key, is_primary)
				VALUES (600, 502, 'post-images/502/a.png', true),
					(601, 502, 'post-images/502/b.png', false);

				-- 좋아요는 옮기지 않는다(리셋 승인) — 원천이 있어도 desk_feed_like는 0행이어야 한다.
				INSERT INTO post_like (id, user_id, post_id) VALUES (700, 2, 502);

				-- 목록 밖 post — 이관 대상이 아니다.
				INSERT INTO post (id, user_id, title, content) VALUES (800, 1, '스토리', '본문');
				""");

		migrateTo(url, null);

		try (Connection connection = connect(url);
				Statement statement = connection.createStatement()) {

			// 옛 글은 사라지고 재이관 4건만 남는다 — 목록 밖 post(800)는 안 들어온다.
			assertThat(queryLong(statement, "select count(*) from desk_feed")).isEqualTo(4L);
			assertThat(queryStrings(statement, "select title from desk_feed order by id"))
					.containsExactly("첫 책상", "둘째 책상", "셋째 책상", "넷째 책상");
			assertThat(queryLong(statement,
					"select count(*) from desk_feed where content = '옛 캡션'")).isZero();

			// title·작성자·감사가 그대로 오고 like_count는 0이다. 본문은 V13이 벗겼던 이미지를
			// V14가 display_order 순으로 도로 이어 붙인 마크다운이다.
			assertThat(queryString(statement,
					"select content from desk_feed where title = '첫 책상'"))
					.isEqualTo("본문\n\n![](post-images/502/a.png)\n\n![](post-images/502/b.png)");
			// 사진도 본문도 없던 행(552)은 빈 문자열이 된다 — NOT NULL은 서고, 노출 게이트가 계속
			// 숨기므로 화면은 그대로다.
			assertThat(queryString(statement,
					"select content from desk_feed where title = '둘째 책상'")).isEmpty();
			assertThat(queryLong(statement, """
					select count(*) from information_schema.columns
					where table_name = 'desk_feed' and column_name = 'content'
						and is_nullable = 'NO'
					""")).isEqualTo(1L);
			assertThat(queryLong(statement,
					"select user_id from desk_feed where title = '첫 책상'")).isEqualTo(1L);
			assertThat(queryLong(statement, "select sum(like_count) from desk_feed")).isZero();
			assertThat(queryLong(statement, "select count(*) from desk_feed_like")).isZero();
			assertThat(queryLong(statement, """
					select count(*) from desk_feed df join post p on p.title = df.title
					where df.created_at = p.created_at
					""")).isEqualTo(4L);

			// 사진은 post-images/ key를 그대로 참조하고, 레지스트리에는 순서·대표 컬럼이 남지
			// 않는다(V14) — 순서 정본은 위에서 확인한 본문이다.
			assertThat(queryStrings(statement,
					"select image_key from desk_feed_image order by image_key"))
					.containsExactly("post-images/502/a.png", "post-images/502/b.png");
			assertThat(queryStrings(statement, """
					select column_name from information_schema.columns
					where table_name = 'desk_feed_image'
						and column_name in ('is_primary', 'display_order')
					""")).isEmpty();
			// 복합 유니크가 사라진 자리를 FK 단독 인덱스가 받는다.
			assertThat(queryStrings(statement, """
					select indexname from pg_indexes
					where tablename = 'desk_feed_image' order by indexname
					""")).containsExactly("idx_desk_feed_image_desk_feed_id", "pk_desk_feed_image");

			// 임시 매핑 컬럼은 남지 않는다.
			assertThat(queryLong(statement, """
					select count(*) from information_schema.columns
					where table_name = 'desk_feed' and column_name = 'source_post_id'
					""")).isZero();

			// 사용된 제품 정션은 빈 채로 생기고 역방향 인덱스를 갖는다(ADR-0034 결정 5 —
			// post 원본에 제품 태그 개념이 없어 재이관 데이터는 없다).
			assertThat(queryLong(statement, "select count(*) from desk_feed_product")).isZero();
			assertThat(queryStrings(statement, """
					select indexname from pg_indexes
					where tablename = 'desk_feed_product' order by indexname
					""")).containsExactly("idx_desk_feed_product_product_id",
					"pk_desk_feed_product", "uq_desk_feed_product_desk_feed_id_product_id");
		}
	}

	@Test
	@DisplayName("post 원본이 없는 환경(로컬 빈 DB)에서는 재이관이 0건이고 마이그레이션은 통과한다")
	void 원본_없음_noop() throws Exception {
		String url = createDatabase("v12_desk_feed_parity_noop");

		migrateTo(url, null);

		try (Connection connection = connect(url);
				Statement statement = connection.createStatement()) {
			assertThat(queryLong(statement, "select count(*) from desk_feed")).isZero();
			assertThat(queryLong(statement, "select count(*) from desk_feed_image")).isZero();
		}
	}

	private String createDatabase(String name) throws Exception {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		try (Connection admin = DriverManager.getConnection(
						postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
				Statement statement = admin.createStatement()) {
			statement.execute("DROP DATABASE IF EXISTS " + name);
			statement.execute("CREATE DATABASE " + name);
		}
		return "jdbc:postgresql://" + postgres.getHost() + ":"
				+ postgres.getMappedPort(5432) + "/" + name;
	}

	private Connection connect(String url) throws Exception {
		var postgres = AbstractPostgresIntegrationTest.POSTGRES;
		return DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
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
		try (Connection connection = connect(url);
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

	private String queryString(Statement statement, String sql) throws Exception {
		try (ResultSet rs = statement.executeQuery(sql)) {
			rs.next();
			return rs.getString(1);
		}
	}

	private List<String> queryStrings(Statement statement, String sql) throws Exception {
		List<String> values = new ArrayList<>();
		try (ResultSet rs = statement.executeQuery(sql)) {
			while (rs.next()) {
				values.add(rs.getString(1));
			}
		}
		return values;
	}
}
