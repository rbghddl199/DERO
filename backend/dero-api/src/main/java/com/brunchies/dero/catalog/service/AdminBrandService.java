package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.CatalogMasterUsage;
import com.brunchies.dero.catalog.dto.BrandCreateRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlResponse;
import com.brunchies.dero.catalog.dto.BrandPatchRequest;
import com.brunchies.dero.catalog.dto.BrandResponse;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import com.brunchies.dero.infra.PresignPort;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 브랜드 마스터 관리(`docs/context/api-spec.md` §9 마스터 6종 — 시드 데이터를 SQL이 아니라 관리자 UI로
 * 넣는다).
 *
 * <p><b>로고는 2단계 presign이다</b> — 발급({@code POST /admin/brands/{id}/logo/upload-url}) 후
 * 클라이언트가 스토리지에 직접 PUT하고, 끝난 key를 {@code PATCH}의 {@code logoImageKey}로 등록한다.
 * 별도 등록 엔드포인트를 두지 않는 것이 명세다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminBrandService {

	private static final String KEY_PREFIX = "brand-logos/";

	/**
	 * 허용 {@code contentType} → 확장자 — 파일명에서 뽑지 않는다({@code ProductImageService}와
	 * 동형, DERO-575). 요청의 {@code fileName}은 계약 유지를 위해 받되 key에 쓰지 않는다.
	 */
	private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
			// 저장 포맷은 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 업로드 전에 한다.
			"image/webp", ".webp");

	private final BrandRepository brands;
	private final CatalogMasterUsage masterUsage;
	private final PresignPort presignPort;

	public OffsetPage<BrandResponse> list(int page, int size) {
		return OffsetPage.from(
				brands.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(BrandResponse::from));
	}

	/** 등록 → 201. {@code logoImageKey}는 아직 없다(브랜드 id가 있어야 presign을 받는다). */
	@Transactional
	public BrandResponse create(BrandCreateRequest request) {
		requireUniqueName(request.name());
		return BrandResponse.from(brands.save(
				Brand.create(request.name(), request.description(), request.brandUrl(), null)));
	}

	/**
	 * 부분 수정 → 200. 영속 엔티티라 {@code save()}를 부르지 않는다 — 커밋 시 dirty checking이 UPDATE를
	 * 낸다(규칙 13).
	 */
	@Transactional
	public BrandResponse update(Long brandId, BrandPatchRequest request) {
		Brand brand = requireBrand(brandId);
		String name = orKeep(request.name(), brand.getName());
		if (!name.equals(brand.getName())) {
			requireUniqueName(name);
		}

		brand.update(name,
				orKeep(request.description(), brand.getDescription()),
				orKeep(request.brandUrl(), brand.getBrandUrl()),
				orKeep(request.logoImageKey(), brand.getLogoImageKey()));
		return BrandResponse.from(brand);
	}

	/**
	 * 소프트 삭제 → 204. <b>참조 중인 제품이 있으면 409로 막는다</b> — 소프트 삭제라 FK는 안 깨지지만,
	 * 그냥 두면 제품 목록·필터가 지워진 브랜드를 계속 가리킨다.
	 */
	@Transactional
	public void delete(Long brandId) {
		Brand brand = requireBrand(brandId);
		if (masterUsage.isBrandInUse(brandId)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_BRAND_IN_USE);
		}
		brand.softDelete();
	}

	/**
	 * 로고 presigned PUT URL 발급 → 200(저장하는 게 없어 201이 아니다).
	 *
	 * <p>key에 브랜드 id를 넣어 브랜드별로 갈라 둔다 — 파일명은 UUID라 사용자 입력이 key에 섞이지
	 * 않는다(경로 조작 방어는 {@code infra/CLAUDE.md} 참조).
	 */
	public BrandLogoUploadUrlResponse presignLogoUpload(
			Long brandId, BrandLogoUploadUrlRequest request) {
		if (!brands.existsByIdAndDeletedAtIsNull(brandId)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_BRAND_NOT_FOUND);
		}
		String extension = IMAGE_EXTENSIONS.get(request.contentType());
		if (extension == null) {
			throw new BusinessException(CatalogErrorCode.CATALOG_INVALID_IMAGE_CONTENT_TYPE);
		}

		String logoKey = KEY_PREFIX + brandId + "/" + UUID.randomUUID() + extension;
		return new BrandLogoUploadUrlResponse(logoKey,
				presignPort.presignUpload(logoKey, request.contentType()));
	}

	private Brand requireBrand(Long brandId) {
		return brands.findByIdAndDeletedAtIsNull(brandId)
				.orElseThrow(() -> new BusinessException(CatalogErrorCode.CATALOG_BRAND_NOT_FOUND));
	}

	private void requireUniqueName(String name) {
		if (brands.existsByNameAndDeletedAtIsNull(name)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_BRAND_NAME_DUPLICATED);
		}
	}

}
