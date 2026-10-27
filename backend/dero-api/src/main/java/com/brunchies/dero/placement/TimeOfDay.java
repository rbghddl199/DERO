package com.brunchies.dero.placement;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 방 무드 시간대({@code placement.time_of_day}) — 창밖 풍경과 햇살 방향·색을 함께 정한다
 * (ADR-0030 결정 4, D31).
 *
 * <p>AI 상상도({@code generated_image.time_of_day})와 <b>같은 값 공간</b>이라 enum도 하나다 —
 * 원래 {@code image} 패키지에 있었으나 {@code placement}가 같은 값을 저장하게 되면서 여기로
 * 옮겼다({@code image} → {@code placement} 의존은 허용 방향이고 그 역은 backflow다, ADR-0007).
 * 값 공간은 같지만 배선은 별건이다 — 상상도가 배치의 시간대를 자동으로 물려받지는 않는다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum TimeOfDay {
	DAY("낮. 방 조명 기본값은 켜짐이고 상상도는 낮 조명으로 만든다."),
	NIGHT("밤. 방 조명 기본값은 꺼짐이고 상상도는 밤 조명으로 만든다.");

	private final String description;
}
