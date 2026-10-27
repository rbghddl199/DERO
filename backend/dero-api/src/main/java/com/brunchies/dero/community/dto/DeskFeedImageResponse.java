package com.brunchies.dero.community.dto;

/**
 * 데스크피드 사진 한 장. {@code imageUrl}은 발급 시점에 조립한 presigned GET URL이고 DB에는
 * {@code imageKey}만 있다 — URL은 만료되므로 저장하거나 캐시하지 않는다({@code PostImageResponse}와
 * 같은 계약).
 *
 * <p><b>순서·대표 필드가 없다</b>(D34·ADR-0037) — 레지스트리 한 줄이다. 화면이 그리는 순서는
 * 본문 마크다운이 정한다. {@code imageKey}는 본문에 박아 넣을 만료 없는 식별자고 {@code id}는
 * 삭제 엔드포인트의 입력이다.
 *
 * <p>{@code productIds}는 <b>이 사진에 찍힌 제품</b>(D37 개정·ADR-0040) — 글 단위
 * {@code usedProducts}의 부분집합이라 이름·가격은 싣지 않는다(화면이 그 목록에서 찾는다).
 * 소프트 삭제된 제품은 여기서도 빠진다 — 폴백 조건을 하나로 두기 위해서다.
 */
public record DeskFeedImageResponse(Long id, String imageKey, String imageUrl,
		java.util.List<Long> productIds) {
}
