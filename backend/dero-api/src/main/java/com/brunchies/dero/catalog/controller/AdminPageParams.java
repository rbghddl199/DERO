package com.brunchies.dero.catalog.controller;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 관리자 목록의 {@code page}·{@code size} 클램프 — 마스터 6종 컨트롤러가 공유한다.
 *
 * <p><b>어노테이션 검증 대신 여기서 자른다</b>: {@code @RequestParam}에 제약을 걸려면 컨트롤러에
 * {@code @Validated}를 얹어야 하는데, 그러면 던져지는 {@code ConstraintViolationException}을
 * {@code GlobalExceptionHandler}가 처리하지 않아 500이 된다({@code AdminProductController}·
 * {@code ProductController}가 이미 같은 판단을 했다).
 *
 * <p>그쪽은 컨트롤러가 하나뿐이라 상수를 사설로 들고 있다. 여기는 여섯 컨트롤러가 같은 규칙을 쓰므로
 * 한 곳에 모은다 — 여섯 벌로 복사하면 상한이 조용히 갈린다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class AdminPageParams {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	static int page(Integer page) {
		return page == null ? 0 : Math.max(page, 0);
	}

	static int size(Integer size) {
		return size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
	}
}
