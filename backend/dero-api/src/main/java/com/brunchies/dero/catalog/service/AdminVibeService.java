package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.Vibe;
import com.brunchies.dero.catalog.dto.VibeCreateRequest;
import com.brunchies.dero.catalog.dto.VibePatchRequest;
import com.brunchies.dero.catalog.dto.VibeResponse;
import com.brunchies.dero.catalog.repository.VibeRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 분위기 태그 마스터 관리(api-spec §9 마스터 6종).
 *
 * <p><b>삭제 게이트가 없다</b> — 제품과의 연결은 정션 {@code product_vibe}이고 그 FK가
 * {@code ON DELETE CASCADE}라(erd.md §4) 참조가 끊어져 매달린 행이 남는 상황이 성립하지 않는다.
 * 브랜드·카테고리는 {@code product} 본체 컬럼이 직접 가리켜서 게이트가 필요했던 것이다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminVibeService {

	private final VibeRepository vibes;

	public OffsetPage<VibeResponse> list(int page, int size) {
		return OffsetPage.from(
				vibes.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(VibeResponse::from));
	}

	@Transactional
	public VibeResponse create(VibeCreateRequest request) {
		requireUniqueName(request.name());
		return VibeResponse.from(vibes.save(Vibe.create(request.name())));
	}

	/** 부분 수정 → 200. 영속 엔티티라 {@code save()}를 부르지 않는다(규칙 13). */
	@Transactional
	public VibeResponse update(Long vibeId, VibePatchRequest request) {
		Vibe vibe = requireVibe(vibeId);
		String name = orKeep(request.name(), vibe.getName());
		if (!name.equals(vibe.getName())) {
			requireUniqueName(name);
		}

		vibe.update(name);
		return VibeResponse.from(vibe);
	}

	@Transactional
	public void delete(Long vibeId) {
		requireVibe(vibeId).softDelete();
	}

	private Vibe requireVibe(Long vibeId) {
		return vibes.findByIdAndDeletedAtIsNull(vibeId)
				.orElseThrow(() -> new BusinessException(CatalogErrorCode.CATALOG_VIBE_NOT_FOUND));
	}

	private void requireUniqueName(String name) {
		if (vibes.existsByNameAndDeletedAtIsNull(name)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_VIBE_NAME_DUPLICATED);
		}
	}
}
