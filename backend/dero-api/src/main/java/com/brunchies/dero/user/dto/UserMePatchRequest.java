package com.brunchies.dero.user.dto;

import jakarta.validation.constraints.Size;

/**
 * {@code PATCH /api/v1/users/me} 요청 — 온보딩의 닉네임 입력도 이 경로를 재사용한다
 * (`docs/context/api-spec.md` §3: 전용 경로를 파지 않는다).
 *
 * <p><b>NULL은 "안 바꾼다"는 뜻이다</b>({@code BrandPatchRequest}와 같은 규칙). 상한 50자는
 * {@code user.nickname} 컬럼이 정본이고, 문자 제약·금칙어는 아직 정해진 것이 없다.
 */
public record UserMePatchRequest(
		@Size(max = 50) String nickname) {
}
