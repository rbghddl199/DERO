package com.brunchies.dero.catalog.repository;

import com.brunchies.dero.catalog.Brand;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** 마스터 애그리거트 루트 리포지토리(ADR-0007). */
public interface BrandRepository extends JpaRepository<Brand, Long> {

	/** 관리자 단건 수정·삭제 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<Brand> findByIdAndDeletedAtIsNull(Long id);

	/**
	 * Nori 사용자 사전을 굽는다(ADR-0019 결정 2) — 사전에 없는 브랜드명은 형태소 분석기가 쪼개서
	 * {@code 라이트크래프트}가 {@code 라이트}(조명) 검색에 걸린다. 손으로 관리하는 사전은 브랜드가
	 * 늘 때 조용히 낡으므로 이 테이블이 정본이다.
	 */
	List<Brand> findAllByDeletedAtIsNull();

	/** 로고 presign 발급 경로 — 엔티티가 필요 없어 존재 여부만 묻는다. */
	boolean existsByIdAndDeletedAtIsNull(Long id);

	/**
	 * 관리자 목록(offset — ADR-0008 결정 5). 정렬을 메서드 이름에 박아 {@link Pageable}에는 넣지
	 * 않는다 — 두 곳에 정렬을 두면 어느 쪽이 이기는지 조용히 갈린다({@code AdminProductService}와 같은 판단).
	 */
	Page<Brand> findAllByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

	/**
	 * 이름 중복 게이트. DB의 부분 유니크 인덱스 {@code uq_brand_name (name) WHERE deleted_at IS NULL}과
	 * <b>같은 조건이어야 한다</b> — 어긋나면 이 검사를 통과한 요청을 DB가 거절하고 그대로 500이 된다.
	 */
	boolean existsByNameAndDeletedAtIsNull(String name);
}
