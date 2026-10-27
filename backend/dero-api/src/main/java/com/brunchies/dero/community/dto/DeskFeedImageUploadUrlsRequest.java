package com.brunchies.dero.community.dto;

import com.brunchies.dero.community.DeskFeed;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * presign 1단계 요청 — 올릴 파일들의 MIME 타입({@code PostImageUploadUrlsRequest}와 같은 2단계
 * 관례). 한 요청의 개수만 막고, 진짜 상한은 서비스가 "이미 있는 장수 + 요청 수"로 판단한다.
 *
 * <p><b>{@link DeskFeed#MAX_IMAGES}를 그대로 읽는다</b> — 여기에 숫자를 직접 적었다가
 * DERO-613이 상한을 10→30으로 올릴 때 이 줄만 10에 남았고, 작성 폼이 본문 사진을 한 번의
 * presign으로 보내는 탓에 11장짜리 글이 400 {@code INVALID_INPUT}으로 죽었다(DERO-625).
 * 서비스의 30장 판정에는 닿지도 못했다.
 */
public record DeskFeedImageUploadUrlsRequest(
		@NotEmpty @Size(max = DeskFeed.MAX_IMAGES) List<@NotBlank String> contentTypes) {
}
