package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.VesaSpec;

/** VESA 규격 단건·목록 공용 응답. */
public record VesaSpecResponse(Long id, int widthMm, int heightMm) {

	public static VesaSpecResponse from(VesaSpec vesaSpec) {
		return new VesaSpecResponse(vesaSpec.getId(), vesaSpec.getWidthMm(), vesaSpec.getHeightMm());
	}
}
