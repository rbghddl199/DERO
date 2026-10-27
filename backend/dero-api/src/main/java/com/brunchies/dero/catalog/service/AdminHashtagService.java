package com.brunchies.dero.catalog.service;

import static com.brunchies.dero.catalog.service.PatchMerge.orKeep;

import com.brunchies.dero.catalog.CatalogErrorCode;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.dto.HashtagCreateRequest;
import com.brunchies.dero.catalog.dto.HashtagPatchRequest;
import com.brunchies.dero.catalog.dto.HashtagResponse;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.OffsetPage;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 해시태그 마스터 관리(api-spec §9 마스터 6종).
 *
 * <p>삭제 게이트가 없는 이유는 {@code AdminVibeService}와 같다 — 정션 {@code product_hashtag}의 FK가
 * {@code ON DELETE CASCADE}다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminHashtagService {

	private final HashtagRepository hashtags;

	public OffsetPage<HashtagResponse> list(int page, int size) {
		return OffsetPage.from(
				hashtags.findAllByDeletedAtIsNullOrderByIdDesc(PageRequest.of(page, size))
						.map(HashtagResponse::from));
	}

	@Transactional
	public HashtagResponse create(HashtagCreateRequest request) {
		requireUniqueName(request.name());
		return HashtagResponse.from(
				hashtags.save(Hashtag.create(request.name(), request.description())));
	}

	/** 부분 수정 → 200. 영속 엔티티라 {@code save()}를 부르지 않는다(규칙 13). */
	@Transactional
	public HashtagResponse update(Long hashtagId, HashtagPatchRequest request) {
		Hashtag hashtag = requireHashtag(hashtagId);
		String name = orKeep(request.name(), hashtag.getName());
		if (!name.equals(hashtag.getName())) {
			requireUniqueName(name);
		}

		hashtag.update(name, orKeep(request.description(), hashtag.getDescription()));
		return HashtagResponse.from(hashtag);
	}

	@Transactional
	public void delete(Long hashtagId) {
		requireHashtag(hashtagId).softDelete();
	}

	private Hashtag requireHashtag(Long hashtagId) {
		return hashtags.findByIdAndDeletedAtIsNull(hashtagId)
				.orElseThrow(() -> new BusinessException(CatalogErrorCode.CATALOG_HASHTAG_NOT_FOUND));
	}

	private void requireUniqueName(String name) {
		if (hashtags.existsByNameAndDeletedAtIsNull(name)) {
			throw new BusinessException(CatalogErrorCode.CATALOG_HASHTAG_NAME_DUPLICATED);
		}
	}
}
