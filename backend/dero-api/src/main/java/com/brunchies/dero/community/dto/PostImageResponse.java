package com.brunchies.dero.community.dto;

/**
 * 게시글 사진 한 장. {@code imageUrl}은 <b>발급 시점에 조립한 presigned GET URL</b>이고 DB에는
 * {@code imageKey}만 있다(ADR-0013 결정 8) — URL은 만료되므로 저장하거나 캐시하지 않는다.
 *
 * <p>{@code imageKey}도 같이 싣는 이유: 본문 마크다운({@code ![alt](...)})을 다시 조립하거나
 * 삭제 대상을 고를 때 프론트가 만료 없는 식별자를 들고 있어야 한다.
 */
public record PostImageResponse(Long id, String imageKey, String imageUrl, boolean isPrimary) {
}
