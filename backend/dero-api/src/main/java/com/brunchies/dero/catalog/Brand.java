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

/**
 * 브랜드 마스터. 감사 3종.
 */
@Entity
@Table(name = "brand")
@SequenceGenerator(name = "brand_seq", sequenceName = "brand_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Brand extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "brand_seq")
	private Long id;

	@Column(name = "name", nullable = false, length = 100)
	private String name;

	@Column(name = "description", columnDefinition = "TEXT")
	private String description;

	@Column(name = "brand_url", length = 2048)
	private String brandUrl;

	@Column(name = "logo_image_key", length = 1024)
	private String logoImageKey;

	public static Brand create(String name, String description, String brandUrl,
		String logoImageKey) {
		return Brand.builder()
			.name(name)
			.description(description)
			.brandUrl(brandUrl)
			.logoImageKey(logoImageKey)
			.build();
	}

	/**
	 * 관리자 수정. 전 필드를 받는다 — 부분 수정의 "NULL은 안 바꾼다" 병합은 서비스가 끝내고 온다
	 * (엔티티가 NULL을 "무시"로 읽기 시작하면 nullable 필드를 진짜 NULL로 되돌릴 길이 막힌다).
	 */
	public void update(String name, String description, String brandUrl, String logoImageKey) {
		this.name = name;
		this.description = description;
		this.brandUrl = brandUrl;
		this.logoImageKey = logoImageKey;
	}
}
