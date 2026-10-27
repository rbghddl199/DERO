package com.brunchies.dero.placement.judgment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * <b>드리프트 방어 — 공유 fixture 계약 테스트</b>({@code docs/context/compatibility.md}, ADR-0004).
 *
 * <p>입력 규격 → 기대 판정 JSON 한 벌을 TS(vitest, {@code frontend/tests/judgment.test.ts})와
 * 이 클래스가 <b>같은 파일</b>로 소비한다. 한쪽 구현만 고치면 다른 쪽이 그날 깨진다 — 그게 이 테스트의
 * 존재 이유다. <b>fixture를 고쳐서 초록으로 만들지 마라</b>: 규칙이 바뀌면
 * {@code compatibility.md} → fixture → 양쪽 구현 순으로 내려간다.
 *
 * <p>스프링 컨텍스트가 없다 — 판정이 순수 함수라 DB도 빈도 필요 없다({@code backend/CLAUDE.md}
 * "엔티티·순수 로직은 단위").
 *
 * <p>{@code expected}가 {@code null}인 케이스는 <b>"판정 행 없음"</b>이고
 * {@link JudgmentResult#INCOMPATIBLE}과 다르다.
 */
class JudgmentFixtureContractTest {

	/**
	 * Gradle 테스트의 작업 디렉터리는 프로젝트 폴더({@code backend/dero-api})다. 프론트 fixture를 그
	 * 기준 상대 경로로 가리킨다 — 복사본을 만들면 그 순간 계약이 둘로 갈려 이 테스트가 무의미해진다.
	 */
	private static final Path FIXTURE = Path.of("../../frontend/tests/fixtures/judgment.json");

	private static final JsonNode FIXTURES = readFixtures();

	private static JsonNode readFixtures() {
		try {
			return new ObjectMapper().readTree(Files.readString(FIXTURE));
		} catch (IOException e) {
			// 경로가 어긋나면 전 케이스가 조용히 통과할 자리라 시끄럽게 죽인다.
			throw new UncheckedIOException(
					"판정 fixture를 못 읽었다: " + FIXTURE.toAbsolutePath(), e);
		}
	}

	static Stream<Arguments> 판정_1_케이스() {
		return cases("armDesk");
	}

	static Stream<Arguments> 판정_2_케이스() {
		return cases("monitorArm");
	}

	private static Stream<Arguments> cases(String section) {
		return StreamSupport.stream(FIXTURES.get(section).spliterator(), false)
				.map(node -> Arguments.of(node.get("name").asText(), node));
	}

	@Test
	@DisplayName("fixture가 비어 있지 않다 (경로가 어긋나면 전 케이스가 조용히 통과한다)")
	void fixture가_비어있지_않다() {
		assertThat(FIXTURES.get("armDesk")).isNotEmpty();
		assertThat(FIXTURES.get("monitorArm")).isNotEmpty();
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("판정_1_케이스")
	@DisplayName("fixture 계약 — 판정 ① 암↔책상")
	void 판정_1(String name, JsonNode testCase) {
		JsonNode armNode = testCase.get("arm");
		JsonNode deskNode = testCase.get("desk");

		Optional<Judgment> actual = CompatibilityJudge.judgeArmDesk(
				new ClampSpec(armNode.get("isClampMountable").asBoolean(),
						intOrNull(armNode, "clampMinMm"), intOrNull(armNode, "clampMaxMm")),
				new GripSpec(deskNode.get("topThicknessMm").asInt(),
						intOrNull(deskNode, "edgeThicknessMm")));

		JsonNode expected = testCase.get("expected");
		if (expected.isNull()) {
			assertThat(actual).as("판정 행 없음 — 불가가 아니다").isEmpty();
			return;
		}
		assertThat(actual).isPresent();
		assertJudgment(actual.orElseThrow(), expected);
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("판정_2_케이스")
	@DisplayName("fixture 계약 — 판정 ② 모니터↔암")
	void 판정_2(String name, JsonNode testCase) {
		JsonNode monitorNode = testCase.get("monitor");
		JsonNode armNode = testCase.get("arm");

		Judgment actual = CompatibilityJudge.judgeMonitorArm(
				new MonitorMountSpec(texts(monitorNode.get("vesa")), intOrNull(monitorNode, "weightG")),
				new ArmMountSpec(texts(armNode.get("vesa")), intOrNull(armNode, "loadCapacityG")));

		assertJudgment(actual, testCase.get("expected"));
	}

	/** 사유 <b>전문</b>은 화면 표기라 fixture에 담지 않는다 — 부분 문자열 검사가 계약이다. */
	private void assertJudgment(Judgment actual, JsonNode expected) {
		assertThat(actual.result())
				.isEqualTo(JudgmentResult.valueOf(expected.get("result").asText()));
		assertThat(actual.reasons()).hasSize(expected.get("reasonCount").asInt());

		String joined = String.join(" | ", actual.reasons());
		for (String needle : texts(expected.get("reasonContains"))) {
			assertThat(joined).contains(needle);
		}
	}

	/** fixture의 DB NULL은 {@code null}이다 — 0으로 옮기면 판정이 통째로 뒤집힌다. */
	private static Integer intOrNull(JsonNode node, String field) {
		JsonNode value = node.get(field);
		return value == null || value.isNull() ? null : value.asInt();
	}

	private static List<String> texts(JsonNode array) {
		List<String> values = new ArrayList<>();
		array.forEach(node -> values.add(node.asText()));
		return values;
	}
}
