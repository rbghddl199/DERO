package com.brunchies.dero.user.dto;

import com.brunchies.dero.user.Terms;
import java.time.OffsetDateTime;

/** 관리자 약관 개정 이력 응답. 재발행을 위해 저장소 key도 관리자에게만 제공한다. */
public record AdminTermsResponse(
		Long id,
		String code,
		int revision,
		String title,
		String contentKey,
		String contentUrl,
		boolean required,
		OffsetDateTime effectiveAt) {

	public static AdminTermsResponse from(Terms terms, String contentUrl) {
		return new AdminTermsResponse(terms.getId(), terms.getCode(), terms.getRevision(),
				terms.getTitle(), terms.getContentKey(), contentUrl, terms.isRequired(),
				terms.getEffectiveAt());
	}
}
