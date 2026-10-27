package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.Brand;

/** 브랜드 단건·목록 공용 응답. 소스가 엔티티 하나뿐이라 정적 팩터리가 여기 산다(규칙 11). */
public record BrandResponse(
		Long id,
		String name,
		String description,
		String brandUrl,
		String logoImageKey) {

	public static BrandResponse from(Brand brand) {
		return new BrandResponse(brand.getId(), brand.getName(), brand.getDescription(),
				brand.getBrandUrl(), brand.getLogoImageKey());
	}
}
