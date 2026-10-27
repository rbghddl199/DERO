package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.Category;

/**
 * 카테고리 단건·목록 공용 응답.
 *
 * <p>부모를 객체가 아니라 id로 내린다 — 트리를 통째로 직렬화하면 목록 한 줄마다 조상 사슬이 딸려
 * 나오고, {@code parent}가 LAZY라 그때 행마다 SELECT가 붙는다. 프록시에서 <b>식별자만</b> 읽는 것은
 * 초기화를 일으키지 않는다.
 */
public record CategoryResponse(
		Long id,
		Long parentId,
		String name,
		String description,
		int displayOrder) {

	public static CategoryResponse from(Category category) {
		Category parent = category.getParent();
		return new CategoryResponse(category.getId(), parent == null ? null : parent.getId(),
				category.getName(), category.getDescription(), category.getDisplayOrder());
	}
}
