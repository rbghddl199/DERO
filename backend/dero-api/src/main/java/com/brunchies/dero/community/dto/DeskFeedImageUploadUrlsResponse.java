package com.brunchies.dero.community.dto;

import java.util.List;

/**
 * presign 1단계 응답 — 요청한 순서 그대로의 {@code (key, 업로드 URL)} 쌍. 브라우저가 URL로 직접
 * PUT한 뒤 그 {@code imageKey}를 2단계({@code POST /desk-feeds/{id}/images})에 되돌려 준다.
 * 저장하는 것이 없어 201이 아니라 200이다(api-spec.md §1 규칙 1).
 */
public record DeskFeedImageUploadUrlsResponse(List<Item> items) {

	public record Item(String imageKey, String uploadUrl) {
	}
}
