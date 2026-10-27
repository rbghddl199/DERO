package com.brunchies.dero.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /admin/categories} 요청.
 *
 * <p><b>{@code parentId}가 NULL이면 루트다</b>(erd.md {@code category} 절 — 루트는 상위가 없으므로
 * NULL이어야 한다). 여기서만 NULL이 "없음"이고 {@link CategoryPatchRequest}에서는 "안 바꾼다"라
 * 뜻이 갈린다 — 등록과 수정의 의미가 원래 다르기 때문이다.
 *
 * <p>{@code displayOrder}는 생략하면 0이다(erd.md 기본값).
 */
public record CategoryCreateRequest(
		Long parentId,
		@NotBlank @Size(max = 50) String name,
		@Size(max = 255) String description,
		@PositiveOrZero Integer displayOrder) {
}
