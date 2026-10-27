package com.brunchies.dero.catalog.dto;

import java.math.BigDecimal;

/**
 * 공개 상판 재질 응답(`GET /api/v1/desk-textures`, DERO-325). 관리자 전용 {@link DeskTextureResponse}는
 * raw object key({@code albedoKey} 등)를 그대로 내보내는데, 이쪽은 읽는 쪽이라 <b>presigned GET URL</b>이
 * 나가야 한다 — 다른 조회 경로(자산·이미지)가 전부 그렇듯 key를 노출하면 프론트가 URL을 직접 조립하게
 * 되고 서명 규칙이 서버 밖으로 샌다.
 *
 * <p>단색 재질은 맵 키가 없어 대응 URL도 {@code null}이다.
 *
 * <p>소스가 엔티티 + presigned URL 3종이라 정적 팩터리({@code from()})가 아니라 서비스
 * ({@code DeskTextureService})가 조립한다(규칙 11).
 */
public record DeskTexturePublicResponse(
		Long id,
		String name,
		String baseColor,
		String albedoUrl,
		String roughnessUrl,
		String normalUrl,
		BigDecimal roughness,
		BigDecimal metalness,
		Integer tileSizeMm,
		int displayOrder) {
}
