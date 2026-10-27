package com.brunchies.dero.catalog.repository;

import com.brunchies.dero.catalog.Category;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** 마스터 애그리거트 루트 리포지토리(ADR-0007). */
public interface CategoryRepository extends JpaRepository<Category, Long> {

	/** 관리자 단건 수정·삭제 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<Category> findByIdAndDeletedAtIsNull(Long id);

	/** 관리자 목록(offset). 정렬은 메서드 이름에 박혀 있다. */
	Page<Category> findAllByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

	/** 공개 목록(`GET /api/v1/categories`, 무페이지) — 표시 순서 → id로 결정적으로 정렬한다. */
	List<Category> findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc();

	/**
	 * 삭제 게이트 — 살아 있는 자식이 하나라도 있으면 막는다. 자식을 남기고 부모만 지우면 그 자식들이
	 * 트리에서 떨어져 나와 탐색 UI에서 사라진다. {@code category.name}엔 유니크가 없어 부모로만
	 * 구분되는 이름이 실재하므로("모니터 &gt; 27인치" vs "책상 &gt; 27인치") 더 나쁘다.
	 */
	boolean existsByParentIdAndDeletedAtIsNull(Long parentId);
}
