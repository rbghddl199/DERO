package com.brunchies.dero.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 공개 카테고리 목록(`GET /api/v1/categories`)의 실제 정렬·소프트 삭제 필터를 검증한다 — 파생 쿼리
 * ({@link CategoryRepository#findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc}) 자체는 기존
 * 코드였지만 리뷰가 지목한 테스트 공백이라(DERO-319) 회귀 테스트로 못 박는다.
 */
class CategoryServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private CategoryService categoryService;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private EntityManager entityManager;

	@Test
	@DisplayName("displayOrder 오름차순으로 정렬하고, 같은 순서값이면 id로 결정적으로 가른다")
	void 목록_정렬() {
		Category b = categories.save(Category.createRoot("모니터", null, 2));
		Category a1 = categories.save(Category.createRoot("책상", null, 1));
		Category a2 = categories.save(Category.createRoot("조명", null, 1));
		entityManager.flush();

		assertThat(categoryService.list())
				.extracting(CategoryResponse::id)
				.containsSubsequence(a1.getId(), a2.getId(), b.getId());
	}

	@Test
	@DisplayName("소프트 삭제한 카테고리는 목록에서 빠진다")
	void 목록_소프트삭제_제외() {
		Category alive = categories.save(Category.createRoot("소품", null, 1));
		Category deleted = categories.save(Category.createRoot("옛 갈래", null, 1));
		deleted.softDelete();
		entityManager.flush();

		assertThat(categoryService.list())
				.extracting(CategoryResponse::id)
				.contains(alive.getId())
				.doesNotContain(deleted.getId());
	}

	@Test
	@DisplayName("하위 트리 id는 3단(대분류→중분류→소분류) 전부를 모으고, 다른 갈래는 안 섞는다")
	void 하위_트리_id() {
		Category root = categories.save(Category.createRoot("소품", null, 1));
		Category mid = categories.save(Category.createChild(root, "주변기기", null, 1));
		Category leaf = categories.save(Category.createChild(mid, "키보드", null, 1));
		Category otherRoot = categories.save(Category.createRoot("조명", null, 2));
		Category otherLeaf = categories.save(Category.createChild(otherRoot, "스탠드", null, 1));
		entityManager.flush();
		entityManager.clear();

		// 중분류 밑 소분류까지 내려간다 — 부모 1단만 보던 옛 롤업이 빠뜨린 게 정확히 이 leaf다.
		assertThat(categoryService.selfAndDescendantIds(List.of(root.getId())))
				.containsExactlyInAnyOrder(root.getId(), mid.getId(), leaf.getId());
		assertThat(categoryService.selfAndDescendantIds(List.of(mid.getId())))
				.containsExactlyInAnyOrder(mid.getId(), leaf.getId());
		assertThat(categoryService.selfAndDescendantIds(List.of(leaf.getId())))
				.containsExactly(leaf.getId());
		assertThat(categoryService.selfAndDescendantIds(List.of(root.getId())))
				.doesNotContain(otherRoot.getId(), otherLeaf.getId());
	}

	@Test
	@DisplayName("여러 카테고리를 주면 각자의 하위 트리를 모은 합집합이고, 중복 id는 한 번만 담긴다")
	void 복수_하위_트리_id() {
		Category root = categories.save(Category.createRoot("소품", null, 1));
		Category mid = categories.save(Category.createChild(root, "주변기기", null, 1));
		Category otherRoot = categories.save(Category.createRoot("조명", null, 2));
		Category otherLeaf = categories.save(Category.createChild(otherRoot, "스탠드", null, 1));
		Category unrelated = categories.save(Category.createRoot("책상", null, 3));
		entityManager.flush();
		entityManager.clear();

		assertThat(categoryService.selfAndDescendantIds(List.of(root.getId(), otherRoot.getId())))
				.containsExactlyInAnyOrder(
						root.getId(), mid.getId(), otherRoot.getId(), otherLeaf.getId())
				.doesNotContain(unrelated.getId());

		// 부모와 그 자식을 같이 넘겨도 자식 id가 두 번 담기지 않는다 — in 절에 중복이 실리면 안 된다.
		assertThat(categoryService.selfAndDescendantIds(List.of(root.getId(), mid.getId())))
				.containsExactlyInAnyOrder(root.getId(), mid.getId());
	}

	@Test
	@DisplayName("자식 카테고리는 parentId로 부모를 가리킨다")
	void 목록_자식_parentId() {
		Category root = categories.save(Category.createRoot("모니터", null, 1));
		Category child = categories.save(Category.createChild(root, "27인치", null, 1));
		entityManager.flush();
		entityManager.clear();

		CategoryResponse childResponse = categoryService.list().stream()
				.filter(response -> response.id().equals(child.getId()))
				.findFirst()
				.orElseThrow();
		assertThat(childResponse.parentId()).isEqualTo(root.getId());
	}
}
