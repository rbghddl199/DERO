package com.brunchies.dero.community.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 댓글 작성 요청.
 *
 * <p>{@code comment.content}는 {@code TEXT}라 DB가 길이를 안 막는다 — 상한은 여기서만 선다.
 * 1000자는 배치에 다는 한 줄 감상 기준이고, 늘려야 하면 스키마가 아니라 이 숫자를 고친다.
 */
public record CommentCreateRequest(@NotBlank @Size(max = 1000) String content) {
}
