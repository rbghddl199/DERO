package com.brunchies.dero.global.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import java.time.OffsetDateTime;
import lombok.Getter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * 감사 베이스 — {@code created_at} + {@code created_by} + {@code updated_at} + {@code updated_by}
 * ({@code docs/context/erd.md} "감사 컬럼").
 *
 * <p>soft delete를 하지 않는 모든 엔티티가 여기를 상속한다. soft delete 대상은
 * {@link BaseSoftDeleteEntity}로 내려간다. 감사 베이스는 이 2단이 전부다 — 그전엔 "감사 1종"용
 * 베이스가 따로 있어 새 엔티티마다 erd.md에서 감사 종류를 찾아 상속을 골라야 했고, 틀리면 컴파일은
 * 통과하고 {@code ddl-auto: validate}가 부팅에서 죽었다(2026-07-28, DERO-210 박동규 결정).
 *
 * <p><b>토글·정션 테이블({@code follow}·{@code product_like} 등)의 {@code updated_at}은 영원히
 * NULL이다.</b> 그 행들은 생성 후 변하지 않고 hard delete된다. 컬럼을 전 테이블에 통일한 건 상속
 * 선택을 없애기 위해서지 "그 행이 수정 가능하다"는 뜻이 아니다.
 *
 * <p>{@code @EntityListeners}는 이 최상위에만 붙인다 — 하위가 각자 붙이면 리스너가 중복 등록된다.
 * 시각 타입은 {@link OffsetDateTime}이다(ADR-0008 결정 7). {@code LocalDateTime}·{@code Instant} 금지.
 *
 * <p>{@code created_by}·{@code updated_by}는 {@code user.id} 값을 담되 <b>FK 제약이 없다</b> —
 * ① 감사 기록은 주체가 사라져도 남아야 하고 ② 시드·마이그레이션처럼 사람이 아닌 삽입이 실재하는
 * {@code user} 행을 요구하면 안 되고 ③ 전 테이블에 인덱스 30여 개가 따라온다. 인증이 배선되기 전
 * 구간에는 NULL로 들어간다({@code global/CLAUDE.md} 참조).
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
@Getter
public abstract class BaseEntity {

	@CreatedDate
	@Column(name = "created_at", nullable = false, updatable = false)
	private OffsetDateTime createdAt;

	@CreatedBy
	@Column(name = "created_by", updatable = false)
	private Long createdBy;

	@LastModifiedDate
	@Column(name = "updated_at")
	private OffsetDateTime updatedAt;

	@LastModifiedBy
	@Column(name = "updated_by")
	private Long updatedBy;
}
