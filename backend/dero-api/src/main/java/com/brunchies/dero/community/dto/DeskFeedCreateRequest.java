package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 데스크피드 작성 본문(api-spec.md §6-보). <b>제목도 마크다운 본문도 필수다</b>(D34·ADR-0037 —
 * ADR-0036의 plain text 선택 본문을 재개정했다). 본문 안 인라인 이미지는 1~30장이고 그 검증은
 * 서비스가 한다(장수는 문자열 형태가 아니라 의미 규칙이라 422다).
 *
 * <p>{@code hashtags}는 {@code null}이면 태그 없음이고 상한 5는 WAS 강제 지점이 이 검증이다.
 * {@code placementId}는 첨부할 3D 배치(선택) — <b>본인 소유 + PUBLIC만</b>이고 서비스가 검증한다
 * (아니면 422).
 *
 * <p>{@code productIds}는 "이 책상에 쓰인 제품"(선택, 상한 10 — ADR-0034 결정 5)이다. 존재하고
 * 소프트 삭제되지 않은 제품만 통과하고 아니면 422다 — 세 경우를 한 코드로 답한다(존재 여부를
 * 흘리지 않는다).
 *
 * <p><b>사진 key가 여기 없다</b> — presign 2단계가 글 id를 요구해서 작성 시점의 본문은 아직
 * 브라우저 미리보기 주소를 물고 있고, 업로드·등록 뒤 {@code PUT}이 본문의 주소를 key로 바꾼다
 * ({@code DeskFeedUploadForm}). 그래서 여기서 검증하는 것은 <b>이미지 장수</b>뿐이다.
 */
public record DeskFeedCreateRequest(
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
