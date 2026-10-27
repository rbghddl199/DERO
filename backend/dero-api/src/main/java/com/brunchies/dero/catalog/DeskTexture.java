package com.brunchies.dero.catalog;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 책상 상판 재질 선택지 마스터. 감사 3종.
 *
 * <p>맵 file key 3종과 {@code tile_size_mm}은 단색(도장) 재질이면 NULL이다 — 그때는 {@code base_color}만
 * 쓴다. {@code roughness}·{@code metalness}는 {@code NUMERIC(3,2)}라 {@link BigDecimal}로 받는다
 * ({@code double}은 반올림이 조용히 어긋난다).
 */
@Entity
@Table(name = "desk_texture")
@SequenceGenerator(name = "desk_texture_seq", sequenceName = "desk_texture_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskTexture extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_texture_seq")
	private Long id;

	@Column(name = "name", nullable = false, length = 50)
	private String name;

	@Column(name = "base_color", nullable = false, length = 7)
	private String baseColor;

	@Column(name = "albedo_key", length = 1024)
	private String albedoKey;

	@Column(name = "roughness_key", length = 1024)
	private String roughnessKey;

	@Column(name = "normal_key", length = 1024)
	private String normalKey;

	@Column(name = "roughness", nullable = false, precision = 3, scale = 2)
	private BigDecimal roughness;

	@Column(name = "metalness", nullable = false, precision = 3, scale = 2)
	private BigDecimal metalness;

	@Column(name = "tile_size_mm")
	private Integer tileSizeMm;

	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	public static DeskTexture create(String name, String baseColor, String albedoKey,
			String roughnessKey, String normalKey, BigDecimal roughness, BigDecimal metalness,
			Integer tileSizeMm, int displayOrder) {
		return DeskTexture.builder()
				.name(name)
				.baseColor(baseColor)
				.albedoKey(albedoKey)
				.roughnessKey(roughnessKey)
				.normalKey(normalKey)
				.roughness(roughness)
				.metalness(metalness)
				.tileSizeMm(tileSizeMm)
				.displayOrder(displayOrder)
				.build();
	}

	/** 관리자 수정. 전 필드를 받는다 — 병합은 서비스가 끝내고 온다. */
	public void update(String name, String baseColor, String albedoKey, String roughnessKey,
			String normalKey, BigDecimal roughness, BigDecimal metalness, Integer tileSizeMm,
			int displayOrder) {
		this.name = name;
		this.baseColor = baseColor;
		this.albedoKey = albedoKey;
		this.roughnessKey = roughnessKey;
		this.normalKey = normalKey;
		this.roughness = roughness;
		this.metalness = metalness;
		this.tileSizeMm = tileSizeMm;
		this.displayOrder = displayOrder;
	}
}
