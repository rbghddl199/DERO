package com.brunchies.dero.user;

import com.brunchies.dero.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 동의 이력. append-only라 동의·철회·재동의가 각각 새 행이고 기존 행은 UPDATE도 DELETE도 하지
 * 않는다 — 그래서 {@code updated_at}은 영원히 NULL이다({@link BaseEntity} 참조).
 *
 * <p>현재 동의 상태는 {@code code}별 최신 행의 {@link #isAgreed}이고, <b>동의 시각은
 * {@code created_at}이다</b> — 별도 {@code agreed_at}을 두지 않는다(영원히 같은 값인 중복 컬럼).
 */
@Entity
@Table(name = "user_consent")
@SequenceGenerator(name = "user_consent_seq", sequenceName = "user_consent_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class UserConsent extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "user_consent_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	/** 동의한 개정 회차. 회차가 올라가면 재동의 대상이 된다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "terms_id", nullable = false)
	private Terms terms;

	/** true=동의, false=거부·철회. */
	@Column(name = "is_agreed", nullable = false)
	private boolean isAgreed;

	/**
	 * 동의 이력 한 건. 철회도 {@code isAgreed = false}인 새 행이다.
	 *
	 * @param terms 동의 대상 개정 회차
	 */
	public static UserConsent create(User user, Terms terms, boolean isAgreed) {
		return UserConsent.builder()
				.user(user)
				.terms(terms)
				.isAgreed(isAgreed)
				.build();
	}
}
