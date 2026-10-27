package com.brunchies.dero.placement.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.repository.PlacementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영진 템플릿 시딩·해제(REQ-ADM-03, {@code docs/context/api-spec.md} §9).
 *
 * <p><b>템플릿은 별도 테이블이 아니라 {@code placement.is_template} 상태다</b>(erd.md "5. 배치" —
 * 배치·템플릿·공개 배치를 테이블 하나 + 상태 컬럼으로 표현한다).
 *
 * <p><b>{@code PlacementService}에 넣지 않고 가른다</b> — 관리자 쓰기는 소유자 검사 대신 역할 검사로
 * 들어오는 다른 계약이고, 공개·admin 분리는 이 코드베이스에서 이미 {@code Admin*} 접두사가
 * 나르고 있다(architecture.md 규칙 19).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminPlacementService {

	private final PlacementRepository placements;

	/** 템플릿 지정. 멱등이라 이미 템플릿인 배치에 다시 불러도 그대로다. */
	@Transactional
	public void markAsTemplate(Long placementId) {
		findActive(placementId).markAsTemplate();
	}

	/** 템플릿 해제. 멱등이라 템플릿이 아닌 배치에 불러도 404가 아니라 no-op이다. */
	@Transactional
	public void unmarkAsTemplate(Long placementId) {
		findActive(placementId).unmarkAsTemplate();
	}

	/**
	 * 소프트 삭제된 배치는 없는 것으로 친다 — 필터는 리포지토리 쿼리에 있다(architecture.md 규칙 2).
	 * 관리자 경로라 가시성 규칙({@code findVisibleById})은 타지 않는다: 아직 공개 전인 운영진 배치를
	 * 템플릿으로 찍는 것이 이 경로의 정상 사용이다.
	 */
	private Placement findActive(Long placementId) {
		return placements.findByIdAndDeletedAtIsNull(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
	}
}
