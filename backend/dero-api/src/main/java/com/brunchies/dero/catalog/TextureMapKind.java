package com.brunchies.dero.catalog;

import java.util.Locale;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 상판 재질 텍스처 맵 종류. {@link DeskTexture}의 key 컬럼 3종과 1:1이다
 * ({@code albedo_key} · {@code roughness_key} · {@code normal_key}).
 *
 * <p>맵이 없는 단색(도장) 재질은 셋 다 NULL이 정상이다(erd.md {@code desk_texture} 절) — 그래서
 * "3종 전부 발급"이 아니라 요청받은 종류만 발급한다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum TextureMapKind {

	ALBEDO("기본 색·무늬 맵. desk_texture.albedo_key와 짝이다."),
	ROUGHNESS("거칠기 맵. desk_texture.roughness_key와 짝이다."),
	NORMAL("표면 요철을 흉내 내는 노멀 맵. desk_texture.normal_key와 짝이다.");

	private final String description;

	/** object key 조립용 소문자 표기 — {@code desk-textures/{id}/albedo-{uuid}.ktx2}. */
	public String keyName() {
		return name().toLowerCase(Locale.ROOT);
	}
}
