package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.DeskTexture;
import java.math.BigDecimal;

/** 상판 재질 단건·목록 공용 응답. */
public record DeskTextureResponse(
		Long id,
		String name,
		String baseColor,
		String albedoKey,
		String roughnessKey,
		String normalKey,
		BigDecimal roughness,
		BigDecimal metalness,
		Integer tileSizeMm,
		int displayOrder) {

	public static DeskTextureResponse from(DeskTexture deskTexture) {
		return new DeskTextureResponse(deskTexture.getId(), deskTexture.getName(),
				deskTexture.getBaseColor(), deskTexture.getAlbedoKey(), deskTexture.getRoughnessKey(),
				deskTexture.getNormalKey(), deskTexture.getRoughness(), deskTexture.getMetalness(),
				deskTexture.getTileSizeMm(), deskTexture.getDisplayOrder());
	}
}
