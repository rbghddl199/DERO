package com.brunchies.dero.user.repository;

import com.brunchies.dero.user.Terms;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 동의 항목 회차 마스터 리포지토리.
 *
 * <p><b>{@code Terms}가 루트인 근거</b>: ADR-0007이 이름을 적어 두진 않았지만, 마스터 6종과 같은
 * 성격이다 — 자체 id에 독립 생명주기고 사용자가 하나도 없어도 존재한다. 어느 애그리거트로도
 * 걸어갈 수 없어 리포지토리가 없으면 조회 경로 자체가 없다.
 */
public interface TermsRepository extends JpaRepository<Terms, Long> {

	List<Terms> findAllByOrderByCodeAscRevisionDesc();

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Terms> findFirstByCodeOrderByRevisionDesc(String code);

	boolean existsByCode(String code);

	/**
	 * 항목({@code code})별 <b>현행 회차 하나씩</b>. 현행은 {@code effective_at <= now} 중 {@code revision}이
	 * 가장 큰 행이다(`erd.md` {@code terms} 절). 미래 시행분은 아직 동의 대상이 아니라 빠진다.
	 *
	 * <p>필수({@code isRequired})가 앞에 오도록 정렬한다 — 온보딩 화면이 필수 항목을 위에 그린다.
	 */
	@Query("""
			SELECT t FROM Terms t
			WHERE t.effectiveAt <= :now
			  AND t.revision = (
			      SELECT MAX(latest.revision) FROM Terms latest
			      WHERE latest.code = t.code AND latest.effectiveAt <= :now)
			ORDER BY t.isRequired DESC, t.code
			""")
	List<Terms> findCurrentRevisions(@Param("now") OffsetDateTime now);
}
