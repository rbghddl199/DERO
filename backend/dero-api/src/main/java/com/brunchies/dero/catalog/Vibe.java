package com.brunchies.dero.catalog;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 제품 분위기 마스터. 감사 3종. */
@Entity
@Table(name = "vibe")
@SequenceGenerator(name = "vibe_seq", sequenceName = "vibe_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Vibe extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "vibe_seq")
	private Long id;

	@Column(name = "name", nullable = false, length = 50)
	private String name;

	public static Vibe create(String name) {
		return Vibe.builder()
				.name(name)
				.build();
	}

	/** 관리자 수정. 병합은 서비스가 끝내고 온다. */
	public void update(String name) {
		this.name = name;
	}
}
