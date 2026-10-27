package com.brunchies.dero.placement.judgment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 호환성 판정 3종의 <b>순수 함수</b> — 규칙 정본은 {@code docs/context/compatibility.md},
 * 판정 위치(프론트 미러 / WAS 정본)는 ADR-0004다.
 *
 * <p><b>입력은 규격 값이지 엔티티가 아니다</b>(mm·g·VESA 문자열). 엔티티를 받으면 스프링 컨텍스트도
 * DB도 없이는 못 돌리고, 무엇보다 3D 메쉬 치수가 슬쩍 섞여 들어올 자리가 생긴다 — 판정 입력은 규격
 * 메타데이터 DB뿐이다(D7/D8, NFR-01). 엔티티 → 규격 값 변환은 {@link PlacementJudge}가 진다.
 *
 * <p><b>이 클래스는 TS 미러와 문구까지 같아야 한다</b>
 * ({@code frontend/src/three/core/collision.ts}). 계약은 언어 중립 fixture
 * {@code frontend/tests/fixtures/judgment.json}이 지고, 양쪽이 같은 파일을 소비하므로 한쪽만 고치면
 * 다른 쪽 테스트가 그날 깨진다(Java 쪽은 {@code JudgmentFixtureContractTest}).
 *
 * <p><b>공간 겹침(배치 충돌)은 여기 없다</b> — 호환성 판정이 아니라 시뮬레이터 지오메트리 소관이다
 * ({@code collider.ts}, REQ-SIM-04). 판정 ③은 "상판 면적 안에 들어가는가"까지다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class CompatibilityJudge {

	/** 결측 사유의 공통 꼬리. 세 판정이 같은 문구를 쓴다. */
	private static final String SPEC_MISSING = "미등록 — 제조사 사양 확인 필요";

	private static final BigDecimal GRAMS_PER_KG = BigDecimal.valueOf(1000);

	/**
	 * <b>판정 ① 암↔책상</b> — 클램프 물림 두께 {@code max(상판, 엣지 마감)}가 클램프 물림 범위 안인가(D21).
	 *
	 * <p><b>게이트는 {@code arm.is_clamp_mountable} 하나다.</b> {@code false}인 암(그로밋 전용·벽
	 * 전용·자립형)은 판정을 <b>수행하지 않는다</b> — 결과 목록에 이 행이 아예 없다는 뜻으로
	 * {@link Optional#empty()}를 낸다. "불가"가 아니다: 그렇게 적으면 "클램프가 안 물린다"와 "애초에
	 * 클램프 제품이 아니다"가 한 값으로 뭉개진다.
	 *
	 * <p>물림 규격이 NULL이면 <b>절대 "적합"으로 떨어뜨리지 않는다</b> — NULL을 0이나 무한대로 치환하면
	 * 각각 전량 불가·전량 적합으로 오판한다. 한쪽만 결측이어도 조건부다.
	 */
	public static Optional<Judgment> judgeArmDesk(ClampSpec arm, GripSpec desk) {
		if (!arm.clampMountable()) {
			return Optional.empty();
		}
		if (arm.clampMinMm() == null || arm.clampMaxMm() == null) {
			return Optional.of(Judgment.conditional(List.of("클램프 물림 규격 " + SPEC_MISSING)));
		}

		int gripMm = desk.gripThicknessMm();
		String source = desk.gripSourceLabel();
		int min = arm.clampMinMm();
		int max = arm.clampMaxMm();

		if (gripMm > max) {
			return Optional.of(Judgment.incompatible(
					List.of("물림 두께 %dmm(%s) > 클램프 최대 %dmm".formatted(gripMm, source, max))));
		}
		if (gripMm < min) {
			return Optional.of(Judgment.incompatible(
					List.of("물림 두께 %dmm(%s) < 클램프 최소 %dmm".formatted(gripMm, source, min))));
		}
		return Optional.of(Judgment.fit());
	}

	/**
	 * <b>판정 ② 모니터↔암</b> — VESA 일치 + 무게 vs 허용 하중.
	 *
	 * <p>두 축은 독립이라 같이 위반이면 사유도 둘 다 낸다. <b>한 축이 결측이고 다른 축이 위반이면
	 * 불가가 이긴다</b> — 이미 확인된 물리적 불가를 "조건부"로 눅이면 결측 방어가 오히려 거짓 통과를 만든다.
	 */
	public static Judgment judgeMonitorArm(MonitorMountSpec monitor, ArmMountSpec arm) {
		List<String> violations = new ArrayList<>();
		List<String> missing = new ArrayList<>();

		if (monitor.vesa().isEmpty() || arm.vesa().isEmpty()) {
			missing.add("VESA 규격 " + SPEC_MISSING);
		} else if (monitor.vesa().stream().noneMatch(arm.vesa()::contains)) {
			violations.add("VESA %s 불일치".formatted(formatVesa(monitor.vesa())));
		}

		// 비양수(0·음수)는 미등록으로 본다 — 허용 하중 0인 암은 카탈로그에 없다.
		if (isMissing(monitor.weightG()) || isMissing(arm.loadCapacityG())) {
			missing.add("무게·허용 하중 규격 " + SPEC_MISSING);
		} else if (monitor.weightG() > arm.loadCapacityG()) {
			violations.add("모니터 %s > 허용 %s"
					.formatted(formatKg(monitor.weightG()), formatKg(arm.loadCapacityG())));
		}

		if (!violations.isEmpty()) {
			List<String> reasons = new ArrayList<>(violations);
			reasons.addAll(missing);
			return Judgment.incompatible(reasons);
		}
		if (!missing.isEmpty()) {
			return Judgment.conditional(missing);
		}
		return Judgment.fit();
	}

	/**
	 * <b>판정 ③ 소품↔책상</b> — 소품 footprint가 상판 면적 안에 들어가는가.
	 *
	 * <p><b>겹침·충돌은 판정하지 않는다</b>(D7/D8) — 다른 아이템과의 공간 겹침은 회전 footprint와 씬
	 * 지오메트리가 필요해 시뮬레이터({@code collider.ts})의 몫이다. 여기서 다루면 같은 판정이 두 곳에
	 * 생기고 둘이 갈린다.
	 */
	public static Judgment judgePropDesk(FootprintSpec prop, FootprintSpec deskTop) {
		if (prop.widthMm() <= 0 || prop.depthMm() <= 0 || deskTop.widthMm() <= 0
				|| deskTop.depthMm() <= 0) {
			return Judgment.conditional(List.of("외형 규격 " + SPEC_MISSING));
		}

		List<String> violations = new ArrayList<>();
		if (prop.widthMm() > deskTop.widthMm()) {
			violations.add("소품 폭 %dmm > 상판 폭 %dmm".formatted(prop.widthMm(), deskTop.widthMm()));
		}
		if (prop.depthMm() > deskTop.depthMm()) {
			violations.add("소품 깊이 %dmm > 상판 깊이 %dmm".formatted(prop.depthMm(), deskTop.depthMm()));
		}
		return violations.isEmpty() ? Judgment.fit() : Judgment.incompatible(violations);
	}

	private static boolean isMissing(Integer grams) {
		return grams == null || grams <= 0;
	}

	/** {@code "100x100"} → 화면 표기 {@code "100×100"}. 여러 규격이면 콤마로 잇는다(D22 배너 문구). */
	private static String formatVesa(List<String> vesa) {
		return String.join(", ", vesa.stream().map(spec -> spec.replace("x", "×")).toList());
	}

	/**
	 * 저장 단위(g) → 표시 단위(kg). {@code 7100 → "7.1kg"}, {@code 5000 → "5kg"}.
	 *
	 * <p>비교는 g 정수끼리 해서 오차가 없고, 사용자에게 나가는 문자열만 여기를 통과한다 — 그램을 그대로
	 * 찍으면 "모니터 7100g > 허용 5000g"가 되어 값은 맞고 읽히지 않는다.
	 */
	private static String formatKg(int grams) {
		return BigDecimal.valueOf(grams)
				.divide(GRAMS_PER_KG, 3, RoundingMode.HALF_UP)
				.stripTrailingZeros()
				.toPlainString() + "kg";
	}
}
