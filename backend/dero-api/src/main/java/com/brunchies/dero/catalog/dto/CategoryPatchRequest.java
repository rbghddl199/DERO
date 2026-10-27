package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * {@code PATCH /admin/categories/{id}} 요청. NULL은 "안 바꾼다"다.
 *
 * <p><b>그래서 하위 카테고리를 루트로 끌어올리는 것은 이 경로로 할 수 없다</b> —
 * {@code parentId: null}이 "루트로 옮겨라"가 아니라 "부모를 안 바꾼다"로 읽히기 때문이다. 다른 PATCH
 * 요청과 규칙을 갈라 놓느니 못 하는 채로 두었다(필요해지면 별도 경로 또는 래퍼 타입).
 */
public record CategoryPatchRequest(
		Long parentId,
		@Size(max = 50) String name,
		@Size(max = 255) String description,
		@PositiveOrZero Integer displayOrder) {
}
