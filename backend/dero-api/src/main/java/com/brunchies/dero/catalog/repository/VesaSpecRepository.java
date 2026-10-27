package com.brunchies.dero.catalog.repository;

import com.brunchies.dero.catalog.VesaSpec;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 마스터 애그리거트 루트 리포지토리(ADR-0007). */
public interface VesaSpecRepository extends JpaRepository<VesaSpec, Long> {

	/** 관리자 단건 수정·삭제 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<VesaSpec> findByIdAndDeletedAtIsNull(Long id);

	/** 관리자 목록(offset). 정렬은 메서드 이름에 박혀 있다. */
	Page<VesaSpec> findAllByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

	/**
	 * 중복 게이트 — 마스터 6종 중 여기만 유니크가 이름이 아니라 <b>홀 간격 쌍</b>이다
	 * ({@code uq_vesa_spec_width_mm_height_mm ... WHERE deleted_at IS NULL}).
	 *
	 * <p>조건이 3개라 파생 쿼리가 아니라 {@code @Query}로 내려간다(ADR-0006 결정 2 — 파생 쿼리는
	 * 조건 2개까지). 이름으로 쓰면 {@code existsByWidthMmAndHeightMmAndDeletedAtIsNull}이 된다.
	 */
	@Query("""
			select count(v) > 0
			from VesaSpec v
			where v.widthMm = :widthMm and v.heightMm = :heightMm and v.deletedAt is null
			""")
	boolean existsBySize(@Param("widthMm") int widthMm, @Param("heightMm") int heightMm);
}
