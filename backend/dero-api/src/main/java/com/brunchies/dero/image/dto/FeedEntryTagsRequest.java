package com.brunchies.dero.image.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * {@code PUT /placements/{id}/feed-entry/tags} 본문 — 이미 공개한 배치의 태그만 갈아 끼운다
 * (DERO-493).
 *
 * <p><b>{@link FeedEntryRequest}와 {@code null}의 뜻이 반대다</b> — 저쪽은 재시도 호출이 실재해서
 * {@code null}이 "태그 미변경"이지만, 여기는 태그를 바꾸러 온 요청 하나뿐이라 {@code null}이면 할 일이
 * 없다. 그래서 {@code @NotNull}이고 <b>빈 배열이 "전부 제거"</b>다. 두 요청이 한 레코드를 나눠 쓰면
 * 같은 {@code null}이 화면마다 다른 뜻이 된다.
 *
 * <p>{@code '#'}은 붙이지 않는다 — {@code PostSaveRequest}·{@link FeedEntryRequest}와 같은 규약이고
 * {@code hashtag} 마스터를 공유하므로 규약도 같아야 한다.
 */
public record FeedEntryTagsRequest(
		@NotNull @Size(max = 20) List<@NotBlank @Size(max = 50) String> tags) {
}
