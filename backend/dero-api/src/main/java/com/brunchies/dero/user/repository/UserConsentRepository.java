package com.brunchies.dero.user.repository;

import com.brunchies.dero.user.UserConsent;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 동의 이력 리포지토리. 커뮤니티 토글 4종({@code placement_like} 등)이 각자 루트인 것과 같은
 * 자리다(ADR-0007 결정 1) — {@code User}로 걸어가려면 이력 전체를 컬렉션으로 물고 와야 한다.
 */
public interface UserConsentRepository extends JpaRepository<UserConsent, Long> {

	/**
	 * 지금 동의 상태가 {@code true}인 회차 id 집합.
	 *
	 * <p>append-only 테이블이라 같은 {@code (user, terms)}가 여러 행일 수 있고 <b>정답은 마지막
	 * 행</b>이다(`erd.md` {@code user_consent} 절). 그래서 {@code is_agreed = true}만 거르지 않고
	 * 회차별 최신 행을 먼저 고른다 — 철회 경로가 생기는 날 이 쿼리를 고치지 않아도 답이 맞는다.
	 */
	@Query("""
			SELECT consent.terms.id FROM UserConsent consent
			WHERE consent.user.id = :userId
			  AND consent.isAgreed = true
			  AND consent.id = (
			      SELECT MAX(latest.id) FROM UserConsent latest
			      WHERE latest.user.id = :userId AND latest.terms.id = consent.terms.id)
			""")
	Set<Long> findAgreedTermsIds(@Param("userId") Long userId);
}
