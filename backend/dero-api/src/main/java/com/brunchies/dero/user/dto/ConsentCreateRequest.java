package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * {@code POST /api/v1/users/me/consents} 요청 — <b>동의 항목 배열을 한 번에</b> 받는다
 * (`docs/context/api-spec.md` §3 온보딩 절).
 *
 * <p>항목마다 한 번씩 부르는 경로를 만들지 않는다 — 중간에 끊기면 필수 약관 일부만 동의된 상태가
 * 남고, 그 상태는 온보딩 완료도 미완료도 아니게 된다.
 */
public record ConsentCreateRequest(
		@NotEmpty List<@NotNull Long> termsIds) {
}
