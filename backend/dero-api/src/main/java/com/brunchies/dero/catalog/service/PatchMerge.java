package com.brunchies.dero.catalog.service;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * PATCH의 "NULL은 안 바꾼다" 규칙 한 곳 — 마스터 6종 서비스가 공유한다.
 *
 * <p>{@code AdminProductService}는 같은 메서드를 private으로 들고 있다. 거기는 한 서비스가 전부라
 * 사설로 충분했지만 여기는 같은 규칙을 여섯 서비스가 쓴다 — 여섯 벌로 복사하면 한 곳만 고쳐 규칙이
 * 갈릴 수 있다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class PatchMerge {

	static <T> T orKeep(T requested, T current) {
		return requested != null ? requested : current;
	}

	/** 원시 필드용 — 엔티티가 {@code int}로 들고 있어 박싱 해제가 필요한 자리. */
	static int orKeep(Integer requested, int current) {
		return requested != null ? requested : current;
	}
}
