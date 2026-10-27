package com.brunchies.dero.user;

import com.brunchies.dero.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 동의 항목의 개정 회차 마스터. 같은 {@code code}의 개정마다 새 행이 쌓이고 기존 행은 고치지도
 * 지우지도 않는다 — 어느 회차에 동의했는지가 법적 증빙이라 soft delete 대상이 아니다.
 *
 * <p>현행 회차는 {@code effective_at <= now()} 중 {@code revision}이 가장 큰 행이다.
 */
@Entity
@Table(name = "terms")
@SequenceGenerator(name = "terms_seq", sequenceName = "terms_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Terms extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "terms_seq")
	private Long id;

	/**
	 * 동의 항목 식별자({@code TERMS_OF_SERVICE}·{@code PRIVACY_POLICY}·{@code MARKETING}·
	 * {@code AGE_OVER_14}). <b>Java enum으로 올리지 말 것</b> — 항목을 행 INSERT만으로 늘리는 게
	 * 이 설계의 요점이라, enum이 되는 순간 배포 없이는 항목을 추가할 수 없다.
	 */
	@Column(name = "code", nullable = false, length = 30)
	private String code;

	/** 같은 {@code code}의 개정 회차. 1부터. {@code version}은 낙관적 락 전용어라 쓰지 않는다. */
	@Column(name = "revision", nullable = false)
	private int revision;

	@Column(name = "title", nullable = false, length = 200)
	private String title;

	/** 개정 회차마다 불변인 약관 본문의 object key. 본문을 아직 안 올린 회차가 있어 nullable이다. */
	@Column(name = "content_key", length = 1024)
	private String contentKey;

	@Column(name = "is_required", nullable = false)
	private boolean isRequired;

	/** 시행 시각. 미래 시각으로 미리 등록해 둘 수 있다. */
	@Column(name = "effective_at", nullable = false)
	private OffsetDateTime effectiveAt;

	/**
	 * 개정 회차 등록.
	 *
	 * @param code 동의 항목 식별자
	 * @param revision 같은 {@code code} 안의 회차. 1부터
	 * @param effectiveAt 시행 시각
	 */
	public static Terms create(String code, int revision, String title, String contentKey,
			boolean isRequired, OffsetDateTime effectiveAt) {
		return Terms.builder()
				.code(code)
				.revision(revision)
				.title(title)
				.contentKey(contentKey)
				.isRequired(isRequired)
				.effectiveAt(effectiveAt)
				.build();
	}
}
