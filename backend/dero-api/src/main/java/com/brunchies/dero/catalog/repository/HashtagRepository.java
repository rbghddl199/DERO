package com.brunchies.dero.catalog.repository;

import com.brunchies.dero.catalog.Hashtag;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** 마스터 애그리거트 루트 리포지토리(ADR-0007). */
public interface HashtagRepository extends JpaRepository<Hashtag, Long> {

	/** 관리자 단건 수정·삭제 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<Hashtag> findByIdAndDeletedAtIsNull(Long id);

	/** 관리자 목록(offset). 정렬은 메서드 이름에 박혀 있다. */
	Page<Hashtag> findAllByDeletedAtIsNullOrderByIdDesc(Pageable pageable);

	/** 이름 중복 게이트 — {@code uq_hashtag_name (name) WHERE deleted_at IS NULL}과 같은 조건이다. */
	boolean existsByNameAndDeletedAtIsNull(String name);

	/**
	 * 이름으로 마스터 한 행. 게시글 태그 입력이 기존 태그를 재사용하는 경로다 —
	 * {@code uq_hashtag_name}과 같은 조건이라 결과는 한 건 이하다.
	 */
	Optional<Hashtag> findByNameAndDeletedAtIsNull(String name);
}
