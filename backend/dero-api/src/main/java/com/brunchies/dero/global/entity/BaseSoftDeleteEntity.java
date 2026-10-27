package com.brunchies.dero.global.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import java.time.OffsetDateTime;
import lombok.Getter;

/**
 * 감사 베이스 + {@code deleted_at} ({@code docs/context/erd.md} "감사 컬럼").
 *
 * <p>{@code deleted_at}에는 기본값이 없다 — NULL이 "살아있음"이다. 대상 테이블 목록은 erd.md
 * "soft delete 대상" 절이 정본이다. 나머지 감사 컬럼 4종은 {@link BaseEntity}가 준다.
 */
@MappedSuperclass
@Getter
public abstract class BaseSoftDeleteEntity extends BaseEntity {

	@Column(name = "deleted_at")
	private OffsetDateTime deletedAt;

	public boolean isDeleted() {
		return deletedAt != null;
	}

	/** 이미 지워진 행은 시각을 덮어쓰지 않는다 — 최초 삭제 시각이 정본이다. */
	public void softDelete() {
		if (deletedAt == null) {
			deletedAt = OffsetDateTime.now();
		}
	}
}
