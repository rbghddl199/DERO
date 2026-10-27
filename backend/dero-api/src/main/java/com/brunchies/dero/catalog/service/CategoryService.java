package com.brunchies.dero.catalog.service;

import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 비로그인 포함 공개 카테고리 조회(`GET /api/v1/categories`, DERO-325) — 관리자 CRUD
 * ({@link AdminCategoryService})와 다른 관심사라 분리한다: 저쪽은 인증된 운영진의 등록·수정·삭제고
 * 이쪽은 누구나 보는 단순 읽기다.
 *
 * <p>트리를 서버가 조립하지 않고 {@code parentId}만 실은 평평한 목록을 돌려준다 — 지금 루트 9개·자식
 * 0개뿐이라 페이지네이션 없이 한 번에 내려도 된다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class CategoryService {

	private final CategoryRepository categories;

	public List<CategoryResponse> list() {
		return categories.findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc().stream()
				.map(CategoryResponse::from)
				.toList();
	}

	/**
	 * 주어진 카테고리들과 그 <b>하위 트리 전체</b>의 id — 카테고리 필터가 트리 깊이와 무관하게 롤업되도록
	 * 목록 조회({@code GET /products?categoryId=})가 쓴다.
	 *
	 * <p>트리는 3단(대분류→중분류→소분류)이고 제품은 세 단 어디에나 배정돼 있다(2026-08-04 실측:
	 * 소품(5) 직속 7행, 주변기기(6) 6행, 키보드(9) 4행). 그래서 <b>부모 1단만 보는 롤업으로는 대분류를
	 * 골랐을 때 소분류 제품이 통째로 빠진다</b> — 실측에서 소품(5)이 29건만 돌려주고 그 밑 소분류
	 * 40여 건을 빠뜨렸다. 카테고리 마스터는 수십 행짜리 작은 표라 전량을 읽어 메모리에서 자손을 모으는
	 * 편이 재귀 CTE보다 싸다. {@code parent}는 LAZY지만 {@code getId()}만 보므로 프록시를 깨우지 않는다.
	 *
	 * <p><b>여러 개를 한 번에 받는다</b> — 시뮬레이터 라이브러리의 기본 선택인 '전체' 타일이
	 * "책상을 뺀 대분류 전부"라서 대분류 id 여러 개를 한 요청으로 걸러야 한다. 마스터 전량 읽기가
	 * 이 메서드의 유일한 쿼리이므로, 루프를 호출부에 두면 id 개수만큼 같은 표를 다시 읽는다.
	 */
	public List<Long> selfAndDescendantIds(Collection<Long> categoryIds) {
		List<Category> all = categories.findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc();
		Set<Long> collected = new LinkedHashSet<>(categoryIds);
		// 목록이 트리 순서라는 보장이 없다(정렬 기준은 display_order) — 더 붙을 게 없을 때까지 돈다.
		boolean changed = true;
		while (changed) {
			changed = false;
			for (Category category : all) {
				Category parent = category.getParent();
				if (parent == null || collected.contains(category.getId())) {
					continue;
				}
				if (collected.contains(parent.getId())) {
					collected.add(category.getId());
					changed = true;
				}
			}
		}
		return List.copyOf(collected);
	}
}
