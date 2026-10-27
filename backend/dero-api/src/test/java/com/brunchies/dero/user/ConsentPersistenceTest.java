package com.brunchies.dero.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ConsentPersistenceTest extends AbstractPostgresIntegrationTest {

	/**
	 * 시딩된 회차와 {@code uq_terms_code_revision}이 부딪히지 않게 띄워 둔 테스트 전용 회차.
	 * {@code V3__seed_terms.sql}이 같은 code들의 <b>1회차</b>를 이미 넣어 두므로 1로 되돌리면
	 * 이 파일 전체가 제약 위반으로 죽는다(2026-08-01, DERO-337).
	 */
	private static final int TEST_REVISION = 99;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private EntityManager entityManager;

	// terms·user_consent는 애그리거트 루트가 아니라 리포지토리가 없다(ADR-0007) — EntityManager로 직접 저장한다.
	private Terms saveTerms(String code, int revision, OffsetDateTime effectiveAt) {
		Terms terms = Terms.create(code, revision, "서비스 이용약관", null, true, effectiveAt);
		entityManager.persist(terms);
		return terms;
	}

	private User saveUser(String email, String providerId, String nickname) {
		return userRepository.save(User.create(email, Provider.KAKAO, providerId, nickname));
	}

	@Test
	@DisplayName("약관 개정 회차를 저장하면 시퀀스 PK가 붙고 시행 시각이 오프셋째로 왕복한다")
	void 약관_저장_왕복() {
		OffsetDateTime effectiveAt = OffsetDateTime.parse("2026-08-01T00:00:00+09:00");
		Terms terms = saveTerms("TERMS_OF_SERVICE", TEST_REVISION, effectiveAt);
		entityManager.flush();
		entityManager.clear();

		Terms found = entityManager.find(Terms.class, terms.getId());
		assertThat(found.getId()).isNotNull();
		assertThat(found.getCode()).isEqualTo("TERMS_OF_SERVICE");
		assertThat(found.getRevision()).isEqualTo(TEST_REVISION);
		assertThat(found.isRequired()).isTrue();
		assertThat(found.getContentKey()).isNull();
		// TIMESTAMPTZ는 UTC로 저장되고 읽을 때 세션 오프셋이 붙는다 — 오프셋이 아니라 순간을 비교한다.
		assertThat(found.getEffectiveAt().toInstant()).isEqualTo(effectiveAt.toInstant());
		assertThat(found.getCreatedAt()).isNotNull();
	}

	@Test
	@DisplayName("같은 항목의 같은 회차를 두 번 등록하면 거부된다 — uq_terms_code_revision")
	void 약관_회차_중복_거부() {
		OffsetDateTime effectiveAt = OffsetDateTime.parse("2026-08-01T00:00:00+09:00");
		saveTerms("PRIVACY_POLICY", TEST_REVISION, effectiveAt);
		entityManager.flush();

		saveTerms("PRIVACY_POLICY", TEST_REVISION, effectiveAt);
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	@Test
	@DisplayName("같은 (사용자, 회차)로 동의·철회·재동의 3행이 전부 남는다 — UNIQUE가 없는 것이 설계다")
	void 동의_이력_append_only() {
		User user = saveUser("consent@example.com", "kakao-20", "동의자");
		Terms terms = saveTerms("MARKETING", TEST_REVISION,
				OffsetDateTime.parse("2026-08-01T00:00:00+09:00"));

		entityManager.persist(UserConsent.create(user, terms, true));
		entityManager.persist(UserConsent.create(user, terms, false));
		entityManager.persist(UserConsent.create(user, terms, true));
		entityManager.flush();
		entityManager.clear();

		List<UserConsent> history = entityManager
				.createQuery("SELECT c FROM UserConsent c WHERE c.user.id = :userId ORDER BY c.id",
						UserConsent.class)
				.setParameter("userId", user.getId())
				.getResultList();
		assertThat(history).hasSize(3);
		assertThat(history).extracting(UserConsent::isAgreed).containsExactly(true, false, true);
	}

	@Test
	@DisplayName("동의 시각은 created_at으로 채워진다 — 별도 agreed_at 컬럼이 없다")
	void 동의_시각은_created_at() {
		User user = saveUser("agreed@example.com", "kakao-21", "동의시각");
		Terms terms = saveTerms("AGE_OVER_14", TEST_REVISION,
				OffsetDateTime.parse("2026-08-01T00:00:00+09:00"));

		UserConsent consent = UserConsent.create(user, terms, true);
		entityManager.persist(consent);
		entityManager.flush();
		entityManager.clear();

		UserConsent found = entityManager.find(UserConsent.class, consent.getId());
		assertThat(found.getCreatedAt()).isNotNull();
		// 이력 테이블이라 updated_at은 영원히 NULL이다(erd.md 전역 규칙, DERO-210).
		// Spring Data 기본값 modifyOnCreate=true면 INSERT만으로도 채워진다 — JpaAuditingConfig가 끈다.
		assertThat(found.getUpdatedAt()).isNull();
		assertThat(found.getTerms().getId()).isEqualTo(terms.getId());
	}
}
