package com.brunchies.dero.placement.judgment;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 호환성 판정의 3값(<b>고정</b>) — {@code docs/GLOSSARY.md}가 정본이고 화면 라벨은 적합/조건부/불가다.
 *
 * <p><b>값이 늘지 않는다.</b> "판정을 수행하지 않았다"는 네 번째 값이 아니라 <b>행이 없는 것</b>으로
 * 표현한다({@link CompatibilityJudge#judgeArmDesk} 가 {@code Optional.empty()}를 내는 자리) —
 * {@code is_clamp_mountable = false}인 암을 "불가"로 적으면 "클램프가 안 물린다"와 "애초에 클램프
 * 제품이 아니다"가 한 값으로 뭉개진다({@code docs/context/compatibility.md} 판정 ①).
 *
 * <p>저장하지 않는다 — 판정 결과는 어느 테이블의 컬럼도 아니고 매번 재계산한다(ADR-0004).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum JudgmentResult {

	FIT("규격상 문제 없음. 사유 목록은 빈 배열이다."),

	/**
	 * 판정 입력 규격이 결측이라 확정할 수 없음. <b>"적합"으로 떨어뜨리지 않는다</b> — 결측을 0이나
	 * 무한대로 치환하면 각각 전량 불가·전량 적합으로 오판한다.
	 */
	CONDITIONAL("판정 입력 규격이 결측이라 확정할 수 없음. 적합으로 떨어뜨리지 않는다."),

	INCOMPATIBLE("규격상 불가. 근거 수치를 사유에 반드시 동봉한다.");

	private final String description;
}
