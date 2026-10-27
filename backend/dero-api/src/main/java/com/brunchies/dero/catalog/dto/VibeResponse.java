package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.Vibe;

/** 분위기 태그 단건·목록 공용 응답. */
public record VibeResponse(Long id, String name) {

	public static VibeResponse from(Vibe vibe) {
		return new VibeResponse(vibe.getId(), vibe.getName());
	}
}
