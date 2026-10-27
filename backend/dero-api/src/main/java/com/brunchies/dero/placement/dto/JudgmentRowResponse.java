package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.judgment.JudgmentKind;
import com.brunchies.dero.placement.judgment.JudgmentResult;
import java.util.List;

/**
 * 판정 1행. <b>수행한 판정만 실린다</b> — {@code is_clamp_mountable = false}인 암은 판정 ① 행이 아예
 * 없다("불가"가 아니다). 화면은 이 목록을 그리는 것이지 아이템 목록을 그리는 게 아니다.
 *
 * @param kind 판정 3종 중 무엇
 * @param ref 판정 대상 아이템의 요청 {@code ref}
 * @param targetRef 상대 아이템의 {@code ref}. 판정 ②의 암이 여기 온다. 책상 상대면 NULL
 * @param result 적합/조건부/불가 3값
 * @param reasons 근거 수치가 든 한국어 사유. 적합이면 빈 목록
 */
public record JudgmentRowResponse(
		JudgmentKind kind,
		String ref,
		String targetRef,
		JudgmentResult result,
		List<String> reasons) {
}
