package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 게시글 작성·수정 공용 본문. <b>{@code PUT}은 부분 갱신이 아니라 전체 교체다</b> — 세 필드를 항상
 * 같이 보낸다.
 *
 * <p><b>배치 참조 필드가 없다</b>(ADR-0013 결정 1·2) — 참조는 {@link #content} 안의
 * {@code [[placement:ID]]} 토큰이 전부이고, 서버가 그 토큰이 <b>본인 소유 + PUBLIC</b> 배치를
 * 가리키는지 저장 시점에 검증한다. 이미지도 여기 없다 — presign 2단계가 따로 등록한다.
 *
 * <p>{@code hashtags}는 {@code null}이면 "태그 없음"으로 읽는다. {@code '#'}은 붙이지 않는다 —
 * 화면 표기일 뿐이라 저장 값에 섞으면 같은 태그가 두 행이 된다.
 */
public record PostSaveRequest(
		@NotBlank @Size(max = 100) String title,
		@NotBlank String content,
		@Size(max = 20) List<@NotBlank @Size(max = 50) String> hashtags) {

	public List<String> hashtagsOrEmpty() {
		return hashtags == null ? List.of() : hashtags;
	}
}
