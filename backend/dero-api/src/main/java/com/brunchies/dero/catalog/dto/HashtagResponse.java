package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.Hashtag;

/** 해시태그 단건·목록 공용 응답. */
public record HashtagResponse(Long id, String name, String description) {

	public static HashtagResponse from(Hashtag hashtag) {
		return new HashtagResponse(hashtag.getId(), hashtag.getName(), hashtag.getDescription());
	}
}
