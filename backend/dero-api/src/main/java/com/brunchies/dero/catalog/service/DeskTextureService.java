package com.brunchies.dero.catalog.service;

import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.dto.DeskTexturePublicResponse;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.infra.PresignPort;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 비로그인 포함 공개 상판 재질 조회(`GET /api/v1/desk-textures`, DERO-325) — 관리자 CRUD
 * ({@link AdminDeskTextureService})와 다른 관심사라 분리한다. 맵 key는 여기서 presigned GET URL로
 * 바뀐다 — raw key를 그대로 내보내는 {@code DeskTextureResponse}는 관리자 전용이다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DeskTextureService {

	private final DeskTextureRepository deskTextures;
	private final PresignPort presignPort;

	public List<DeskTexturePublicResponse> list() {
		return deskTextures.findAllByDeletedAtIsNullOrderByDisplayOrderAscIdAsc().stream()
				.map(this::toPublicResponse)
				.toList();
	}

	private DeskTexturePublicResponse toPublicResponse(DeskTexture deskTexture) {
		return new DeskTexturePublicResponse(
				deskTexture.getId(),
				deskTexture.getName(),
				deskTexture.getBaseColor(),
				presignOrNull(deskTexture.getAlbedoKey()),
				presignOrNull(deskTexture.getRoughnessKey()),
				presignOrNull(deskTexture.getNormalKey()),
				deskTexture.getRoughness(),
				deskTexture.getMetalness(),
				deskTexture.getTileSizeMm(),
				deskTexture.getDisplayOrder());
	}

	/** 단색 재질은 맵 key가 없다 — 없는 key로 presign을 부르지 않는다(헛호출 방지). */
	private String presignOrNull(String key) {
		return key == null ? null : presignPort.presignGet(key);
	}
}
