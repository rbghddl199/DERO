package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.TextureMapKind;
import java.util.List;

/**
 * 맵 종류별 presign 발급 결과. 각 {@code key}는 업로드가 끝난 뒤
 * {@code PATCH /admin/desk-textures/{id}}의 {@code albedoKey}·{@code roughnessKey}·
 * {@code normalKey}로 되돌려 보낼 값이다 — {@code kind}가 그 대응을 알려준다.
 */
public record DeskTextureMapUploadUrlResponse(List<MapUploadUrl> maps) {

	public record MapUploadUrl(TextureMapKind kind, String key, String uploadUrl) {
	}
}
