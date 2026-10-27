package com.brunchies.dero.image.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * {@code PUT /placements/{id}/feed-entry} 본문 — <b>태그 배열 하나뿐이다</b>(ADR-0027 결정 5).
 *
 * <p><b>태그를 다는 자리가 여기인 이유</b>: {@code PRIVATE} 배치의 태그는 아무도 못 본다. 공개 전환
 * 화면이 이미 사용자에게 "남에게 보일 것"을 묻는 자리라, 저장할 때마다({@code PUT /placements/{id}})
 * 묻지 않는다.
 *
 * <p><b>{@code null}과 빈 배열은 다른 뜻이다</b> — {@code null}(또는 본문 없음)은 <b>태그 미변경</b>,
 * 빈 배열은 <b>태그 전부 제거</b>다. {@code PUT}이 곧 재시도 버튼이라(api-spec.md §4) 본문 없이 다시
 * 부르는 호출이 실재하는데, 그것을 "태그 없음"으로 읽으면 재시도 한 번에 태그가 조용히 지워진다.
 *
 * <p>{@code '#'}은 붙이지 않는다 — 화면 표기일 뿐이라 저장 값에 섞으면 같은 태그가 두 행이 된다
 * ({@code PostSaveRequest}와 같은 규약이고 {@code hashtag} 마스터를 공유하므로 규약도 같아야 한다).
 *
 * <p><b>게시 상태({@code status})는 여기서도 받지 않는다</b> — {@code PUBLIC}·{@code FAILED}는 서버
 * 전용이다(ADR-0015 결정 10).
 */
public record FeedEntryRequest(
		@Size(max = 20) List<@NotBlank @Size(max = 50) String> tags) {
}
