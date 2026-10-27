package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.TextureMapKind;
import com.brunchies.dero.catalog.dto.DeskTextureCreateRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlRequest;
import com.brunchies.dero.catalog.dto.DeskTextureMapUploadUrlResponse;
import com.brunchies.dero.catalog.dto.DeskTexturePatchRequest;
import com.brunchies.dero.catalog.dto.DeskTextureResponse;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import com.brunchies.dero.infra.PresignPort;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 상판 재질 마스터 관리(api-spec §9 마스터 6종).
 *
 * <p><b>맵 3종은 2단계 presign이다</b> — 발급
 * ({@code POST /admin/desk-textures/{id}/map-upload-urls})으로 종류별 key와 URL을 받아 업로드하고,
 * 끝난 key를 {@code PATCH}의 {@code albedoKey}·{@code roughnessKey}·{@code normalKey}로 등록한다.
 * 별도 등록 엔드포인트를 두지 않는 것이 명세다.
 *
 * <p><b>단색(도장) 재질은 맵을 하나도 안 올려도 정상이다</b>(erd.md {@code desk_texture} 절 — 시딩
 * 4종 중 블랙·화이트가 그렇다). 그래서 발급은 "3종 전부"가 아니라 요청받은 종류만 한다.
 *
 * <p><b>삭제 게이트가 없다</b> — erd.md가 이 테이블에 소프트 삭제를 둔 이유 자체가 "재질을 내려도
 * 그걸 쓰던 기존 배치가 참조를 잃으면 안 된다"이기 때문이다. 참조 중이면 못 지우게 막는 것은 그
 * 결정을 뒤집는 것이라 하지 않는다({@code desk.desk_texture_id}는 {@code NOT NULL}이지만 행은 남으므로
 * 끊어지지 않는다).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminDeskTextureService {

	private static final String KEY_PREFIX = "desk-textures/";
	private static final String KEY_SUFFIX = ".ktx2";

	/** 맵은 전부 KTX2라 클라이언트에게 물어보지 않고 서버가 정한다. */
	private static final String MAP_CONTENT_TYPE = "image/ktx2";

	private final DeskTextureRepository deskTextures;
	private final PresignPort presignPort;

	public OffsetPage<DeskTextureResponse> list(int page, int size) {
		return OffsetPage.from(
				deskTextures.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(DeskTextureResponse::from));
	}

	/** 등록 → 201. 맵 key 3종은 아직 없다(재질 id가 있어야 presign을 받는다). */
	@Transactional
	public DeskTextureResponse create(DeskTextureCreateRequest request) {
		requireUniqueName(request.name());
		return DeskTextureResponse.from(deskTextures.save(DeskTexture.create(
				request.name(), request.baseColor(), null, null, null,
				request.roughness(), request.metalness(), request.tileSizeMm(),
				request.displayOrder() == null ? 0 : request.displayOrder())));
	}

	/** 부분 수정 → 200. 맵 key 등록 경로이기도 하다. 영속 엔티티라 {@code save()}를 부르지 않는다. */
	@Transactional
	public DeskTextureResponse update(Long deskTextureId, DeskTexturePatchRequest request) {
		DeskTexture deskTexture = requireDeskTexture(deskTextureId);
		String name = orKeep(request.name(), deskTexture.getName());
		if (!name.equals(deskTexture.getName())) {
			requireUniqueName(name);
		}

		deskTexture.update(name,
				orKeep(request.baseColor(), deskTexture.getBaseColor()),
				orKeep(request.albedoKey(), deskTexture.getAlbedoKey()),
				orKeep(request.roughnessKey(), deskTexture.getRoughnessKey()),
				orKeep(request.normalKey(), deskTexture.getNormalKey()),
				orKeep(request.roughness(), deskTexture.getRoughness()),
				orKeep(request.metalness(), deskTexture.getMetalness()),
				orKeep(request.tileSizeMm(), deskTexture.getTileSizeMm()),
				orKeep(request.displayOrder(), deskTexture.getDisplayOrder()));
		return DeskTextureResponse.from(deskTexture);
	}

	@Transactional
	public void delete(Long deskTextureId) {
		requireDeskTexture(deskTextureId).softDelete();
	}

	/**
	 * 맵 presigned PUT URL 발급 → 200(저장하는 게 없어 201이 아니다).
	 *
	 * <p>key는 {@code desk-textures/{id}/{kind}-{uuid}.ktx2}다 — {@code kind}를 파일명에 넣어 스토리지만
	 * 보고도 어느 맵인지 알 수 있게 하고, UUID로 재업로드 시 덮어쓰기를 피한다(옛 key를 참조하던
	 * 캐시가 깨지지 않는다).
	 */
	public DeskTextureMapUploadUrlResponse presignMapUploads(
			Long deskTextureId, DeskTextureMapUploadUrlRequest request) {
		if (!deskTextures.existsByIdAndDeletedAtIsNull(deskTextureId)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_DESK_TEXTURE_NOT_FOUND);
		}

		List<DeskTextureMapUploadUrlResponse.MapUploadUrl> maps = request.kinds().stream()
				.map(kind -> presignOne(deskTextureId, kind))
				.toList();
		return new DeskTextureMapUploadUrlResponse(maps);
	}

	private DeskTextureMapUploadUrlResponse.MapUploadUrl presignOne(
			Long deskTextureId, TextureMapKind kind) {
		String key = KEY_PREFIX + deskTextureId + "/" + kind.keyName() + "-" + UUID.randomUUID()
				+ KEY_SUFFIX;
		return new DeskTextureMapUploadUrlResponse.MapUploadUrl(
				kind, key, presignPort.presignUpload(key, MAP_CONTENT_TYPE));
	}

	private DeskTexture requireDeskTexture(Long deskTextureId) {
		return deskTextures.findByIdAndDeletedAtIsNull(deskTextureId)
				.orElseThrow(
						() -> new BusinessException(CatalogErrorCode.CATALOG_DESK_TEXTURE_NOT_FOUND));
	}

	private void requireUniqueName(String name) {
		if (deskTextures.existsByNameAndDeletedAtIsNull(name)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_DESK_TEXTURE_NAME_DUPLICATED);
		}
	}
}
