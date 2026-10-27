package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.FrameType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * 책상 규격 입력. 등록(POST)·수정(PATCH)이 공유하고 필수 여부를 {@link OnCreate} 그룹이 가른다.
 *
 * <p><b>전 필드가 박싱 타입이다</b> — PATCH에서 NULL이 "이 필드는 안 바꾼다"를 뜻해야 하는데 원시
 * 타입은 그 상태를 표현할 수 없다. 등록에서 빠뜨리는 것은 {@code @NotNull(groups = OnCreate.class)}가
 * 막는다.
 *
 * <p><b>{@code isRounded}에 기본값이 없는 이유</b>: 규격 서브타입 boolean은 실측해서 반드시 채우는
 * 값이라 미입력이 조용히 "아니오"로 둔갑하면 안 된다(erd.md 전역 규칙 "제약"의 명시적 예외).
 */
public record DeskSpecRequest(
		@NotNull(groups = OnCreate.class) @Positive Integer widthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer depthMm,
		@NotNull(groups = OnCreate.class) @Positive Integer heightMm,
		@NotNull(groups = OnCreate.class) @Positive Integer topThicknessMm,
		@NotNull(groups = OnCreate.class) @Positive Integer edgeThicknessMm,
		@NotNull(groups = OnCreate.class) Boolean isRounded,
		@NotNull(groups = OnCreate.class) Long deskTextureId,
		@NotNull(groups = OnCreate.class) FrameType frameType,
		@Positive Integer allowedLoadG) {
}
