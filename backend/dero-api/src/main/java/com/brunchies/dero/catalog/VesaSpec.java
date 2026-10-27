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

/** VESA 홀 간격 마스터. 감사 3종. */
@Entity
@Table(name = "vesa_spec")
@SequenceGenerator(name = "vesa_spec_seq", sequenceName = "vesa_spec_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class VesaSpec extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "vesa_spec_seq")
	private Long id;

	@Column(name = "width_mm", nullable = false)
	private int widthMm;

	@Column(name = "height_mm", nullable = false)
	private int heightMm;

	public static VesaSpec create(int widthMm, int heightMm) {
		return VesaSpec.builder()
				.widthMm(widthMm)
				.heightMm(heightMm)
				.build();
	}

	/** 관리자 수정. 병합은 서비스가 끝내고 온다. */
	public void update(int widthMm, int heightMm) {
		this.widthMm = widthMm;
		this.heightMm = heightMm;
	}
}
