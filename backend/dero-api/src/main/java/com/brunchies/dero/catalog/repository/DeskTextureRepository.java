package com.brunchies.dero.catalog.repository;

import com.brunchies.dero.catalog.DeskTexture;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** 마스터 애그리거트 루트 리포지토리(ADR-0007). */
public interface DeskTextureRepository extends JpaRepository<DeskTexture, Long> {

	/** 관리자 단건 수정·삭제 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<DeskTexture> findByIdAndDeletedAtIsNull(Long id);

	/** 맵 presign 발급 경로 — 엔티티가 필요 없어 존재 여부만 묻는다. */
	boolean existsByIdAndDeletedAtIsNull(Long id);

	/** 관리자 목록(offset). 정렬은 메서드 이름에 박혀 있다. */
	Page<DeskTexture> findAllByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

	/** 공개 목록(`GET /api/v1/desk-textures`, 무페이지) — 표시 순서 → id로 결정적으로 정렬한다. */
	List<DeskTexture> findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc();

	/** 이름 중복 게이트 — {@code uq_desk_texture_name (name) WHERE deleted_at IS NULL}과 같은 조건이다. */
	boolean existsByNameAndDeletedAtIsNull(String name);
}
