package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 데스크피드 수정 본문 — <b>부분 갱신이 아니라 전체 교체다</b>(api-spec.md §6-보: PUT이 제목·본문·
 * 태그·사용 제품·배치 첨부/해제를 다 받는다).
 *
 * <p><b>사진은 여기서 건드리지 않는다</b>(D34·ADR-0037 — ADR-0036의 {@code imageKeys} 전체 교체를
 * 재폐기했다). 사진 등록·삭제는 전용 엔드포인트고, 어느 사진이 몇 번째인지는 {@code content}
 * 마크다운 안 위치가 정한다 — 순서를 정하는 곳이 하나여야 한다.
 *
 * <p>{@code placementId}가 {@code null}이면 <b>첨부 해제</b>다 — 전체 교체 의미론이라 "안 건드림"이
 * 아니다. {@code productIds}도 같다 — {@code null}이나 빈 배열이면 사용된 제품 태그를 전부 뗀다.
 */
public record DeskFeedUpdateRequest(
		@NotBlank @Size(max = 100) String title,
		@NotBlank String content,
		@Size(max = 5) List<@NotBlank @Size(max = 50) String> hashtags,
		Long placementId,
		@Size(max = 10) List<Long> productIds) {

	public List<String> hashtagsOrEmpty() {
		return hashtags == null ? List.of() : hashtags;
	}

	public List<Long> productIdsOrEmpty() {
		return productIds == null ? List.of() : productIds;
	}
}
