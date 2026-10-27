package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.CatalogMasterUsage;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.dto.CategoryCreateRequest;
import com.brunchies.dero.catalog.dto.CategoryPatchRequest;
import com.brunchies.dero.catalog.dto.CategoryResponse;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 카테고리 마스터 관리(api-spec §9 마스터 6종).
 *
 * <p><b>마스터 6종 중 유일하게 이름 중복 검사가 없다</b> — 계층 트리라 부모가 다르면 같은 이름이
 * 정당하다("모니터 &gt; 27인치", "책상 &gt; 1200mm"). erd.md가 {@code category}에만 부분 유니크
 * 인덱스를 두지 않은 이유이기도 하다.
 *
 * <p>대신 <b>부모 참조 검증</b>이 여기에만 있다 — 자기 자신이나 자기 하위 트리를 부모로 지정하면
 * 사이클이 생겨 트리 순회가 무한 루프에 빠진다. DB는 자기참조 FK만 볼 뿐 사이클을 막지 않는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminCategoryService {

	private final CategoryRepository categories;
	private final CatalogMasterUsage masterUsage;

	public OffsetPage<CategoryResponse> list(int page, int size) {
		return OffsetPage.from(
				categories.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(CategoryResponse::from));
	}

	/** 등록 → 201. {@code parentId}가 NULL이면 루트다(erd.md — 루트는 상위가 없으므로 NULL). */
	@Transactional
	public CategoryResponse create(CategoryCreateRequest request) {
		int displayOrder = request.displayOrder() == null ? 0 : request.displayOrder();
		Category created = request.parentId() == null
				? Category.createRoot(request.name(), request.description(), displayOrder)
				: Category.createChild(requireParent(request.parentId()), request.name(),
						request.description(), displayOrder);
		return CategoryResponse.from(categories.save(created));
	}

	/**
	 * 부분 수정 → 200. {@code parentId}가 NULL이면 부모를 안 바꾼다 — "루트로 끌어올린다"가 아니다
	 * ({@code CategoryPatchRequest} 참조).
	 */
	@Transactional
	public CategoryResponse update(Long categoryId, CategoryPatchRequest request) {
		Category category = requireCategory(categoryId);
		Category parent = category.getParent();
		if (request.parentId() != null) {
			parent = requireParent(request.parentId());
			requireAcyclic(category, parent);
		}

		category.update(parent,
				orKeep(request.name(), category.getName()),
				orKeep(request.description(), category.getDescription()),
				orKeep(request.displayOrder(), category.getDisplayOrder()));
		return CategoryResponse.from(category);
	}

	/**
	 * 소프트 삭제 → 204. 게이트가 둘이다 — 참조 중인 제품(409)과 살아 있는 자식(409). 자식을 남기고
	 * 부모만 지우면 그 자식들이 트리에서 떨어져 나와 탐색 UI에서 사라진다.
	 */
	@Transactional
	public void delete(Long categoryId) {
		Category category = requireCategory(categoryId);
		if (masterUsage.isCategoryInUse(categoryId)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_CATEGORY_IN_USE);
		}
		if (categories.existsByParentIdAndDeletedAtIsNull(categoryId)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_CATEGORY_HAS_CHILDREN);
		}
		category.softDelete();
	}

	/**
	 * 새 부모의 조상 사슬을 거슬러 오르며 자기 자신이 나오는지 본다. 첫 바퀴가 {@code parent == category}
	 * 검사를 겸하므로 자기참조도 여기서 걸린다.
	 *
	 * <p>사슬이 유한하다는 보장은 <b>이 메서드 자신</b>이다 — 부모 링크를 만드는 경로가 등록·수정 둘
	 * 뿐이고 둘 다 여기를 통과한다. {@code parent}는 LAZY지만 트랜잭션 안이라 한 단계씩 로드된다.
	 */
	private static void requireAcyclic(Category category, Category parent) {
		for (Category ancestor = parent; ancestor != null; ancestor = ancestor.getParent()) {
			if (ancestor.getId().equals(category.getId())) {
				throw new BusinessException(CatalogErrorCode.CATALOG_CATEGORY_PARENT_INVALID);
			}
		}
	}

	private Category requireCategory(Long categoryId) {
		return categories.findByIdAndDeletedAtIsNull(categoryId)
				.orElseThrow(() -> new BusinessException(CatalogErrorCode.CATALOG_CATEGORY_NOT_FOUND));
	}

	/** 상위와 대상은 같은 404라도 코드를 가른다 — 운영진이 어느 id가 틀렸는지 알아야 한다. */
	private Category requireParent(Long parentId) {
		return categories.findByIdAndDeletedAtIsNull(parentId)
				.orElseThrow(
						() -> new BusinessException(CatalogErrorCode.CATALOG_CATEGORY_PARENT_NOT_FOUND));
	}
}
