package com.brunchies.dero.user.dto;

import com.brunchies.dero.user.Terms;
import java.time.OffsetDateTime;

/**
 * {@code GET /api/v1/terms} 응답 원소 — 항목별 <b>현행 회차 하나</b>다.
 *
 * <p>{@code contentKey}는 그대로 내보내지 않는다({@code User.profileImageKey}와 같은 규칙) —
 * 완성 URL은 WAS가 발급 시점에 조립한다. 본문을 아직 안 올린 회차는 {@code contentUrl}이 NULL이다.
 */
public record TermsResponse(
		Long id,
		String code,
		int revision,
		String title,
		String contentUrl,
		boolean required,
		OffsetDateTime effectiveAt) {

	public static TermsResponse from(Terms terms, String contentUrl) {
		return new TermsResponse(terms.getId(), terms.getCode(), terms.getRevision(),
				terms.getTitle(), contentUrl, terms.isRequired(), terms.getEffectiveAt());
	}
}
