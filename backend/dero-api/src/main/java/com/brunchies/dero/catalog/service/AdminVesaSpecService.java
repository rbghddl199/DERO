package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.dto.VesaSpecCreateRequest;
import com.brunchies.dero.catalog.dto.VesaSpecPatchRequest;
import com.brunchies.dero.catalog.dto.VesaSpecResponse;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * VESA 규격 마스터 관리(api-spec §9 마스터 6종).
 *
 * <p><b>중복 판정 키가 이름이 아니라 홀 간격 쌍이다</b>({@code uq_vesa_spec_width_mm_height_mm}) —
 * 100×100이 두 행으로 갈리면 모니터↔암 판정이 어느 행을 잡느냐에 따라 답이 갈린다.
 *
 * <p>삭제 게이트가 없는 이유는 {@code AdminVibeService}와 같다 — 정션 {@code product_vesa}의 FK가
 * {@code ON DELETE CASCADE}다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminVesaSpecService {

	private final VesaSpecRepository vesaSpecs;

	public OffsetPage<VesaSpecResponse> list(int page, int size) {
		return OffsetPage.from(
				vesaSpecs.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(VesaSpecResponse::from));
	}

	@Transactional
	public VesaSpecResponse create(VesaSpecCreateRequest request) {
		requireUniqueSize(request.widthMm(), request.heightMm());
		return VesaSpecResponse.from(
				vesaSpecs.save(VesaSpec.create(request.widthMm(), request.heightMm())));
	}

	/** 부분 수정 → 200. 영속 엔티티라 {@code save()}를 부르지 않는다(규칙 13). */
	@Transactional
	public VesaSpecResponse update(Long vesaSpecId, VesaSpecPatchRequest request) {
		VesaSpec vesaSpec = requireVesaSpec(vesaSpecId);
		int widthMm = orKeep(request.widthMm(), vesaSpec.getWidthMm());
		int heightMm = orKeep(request.heightMm(), vesaSpec.getHeightMm());
		if (widthMm != vesaSpec.getWidthMm() || heightMm != vesaSpec.getHeightMm()) {
			requireUniqueSize(widthMm, heightMm);
		}

		vesaSpec.update(widthMm, heightMm);
		return VesaSpecResponse.from(vesaSpec);
	}

	@Transactional
	public void delete(Long vesaSpecId) {
		requireVesaSpec(vesaSpecId).softDelete();
	}

	private VesaSpec requireVesaSpec(Long vesaSpecId) {
		return vesaSpecs.findByIdAndDeletedAtIsNull(vesaSpecId)
				.orElseThrow(() -> new BusinessException(CatalogErrorCode.CATALOG_VESA_SPEC_NOT_FOUND));
	}

	private void requireUniqueSize(int widthMm, int heightMm) {
		if (vesaSpecs.existsBySize(widthMm, heightMm)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_VESA_SPEC_DUPLICATED);
		}
	}
}
