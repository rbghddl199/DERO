package com.brunchies.dero.catalog.dto;

import com.brunchies.dero.catalog.TextureMapKind;
import jakarta.validation.constraints.NotEmpty;
import java.util.Set;

/**
 * {@code POST /admin/desk-textures/{id}/map-upload-urls} 요청 — 발급받을 맵 종류 목록.
 *
 * <p><b>{@link Set}이라 중복이 구조적으로 사라진다.</b> 같은 종류를 두 번 보내면 key가 둘 생기고 그중
 * 하나는 PATCH로 등록되지 못한 채 스토리지에 남는다 — 서비스에서 걸러내는 대신 타입으로 막는다.
 *
 * <p>{@code contentType}을 받지 않는다 — 맵은 전부 KTX2라 서버가 정한다.
 */
public record DeskTextureMapUploadUrlRequest(
		@NotEmpty Set<TextureMapKind> kinds) {
}
