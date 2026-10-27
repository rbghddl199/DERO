package com.brunchies.dero.placement.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.placement.dto.EstimateResponse;
import com.brunchies.dero.placement.repository.PlacementRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 견적(REQ-REC-01, {@code api-spec.md} §4의 {@code GET /placements/{id}/estimate}).
 *
 * <p><b>{@link PlacementService}에 얹지 않고 파일을 나눴다</b> — 저장·병합·썸네일과 공유하는 상태가
 * 하나도 없는 순수 조회다. 19KB짜리 서비스에 더 붙이는 것보다 읽는 자리가 분명해진다.
 *
 * <p><b>가시성 규칙은 {@link PlacementRepository#findVisibleById}를 그대로 쓴다</b>(api-spec.md §4) —
 * 비로그인은 {@code PUBLIC}만, 로그인은 {@code PUBLIC} + 본인 소유 비공개까지. 규칙에 안 맞으면
 * 404다(403이 아니다 — 남의 비공개 배치가 존재한다는 사실 자체를 흘리지 않는다). 조건을 여기에
 * 손으로 옮겨 적지 않는다.
 *
 * <p><b>견적은 저장하지 않는다.</b> {@code placement.budget_krw}는 사용자가 입력한 예산이지 견적
 * 스냅샷이 아니다(erd.md) — 합계는 매번 현재 아이템과 현재 제품 가격으로 다시 센다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PlacementEstimateService {

	private final PlacementRepository placements;

	/**
	 * 합계 = 아이템 가격 합 + 제품 모드 책상 가격. 계산 자체는 {@link #totalPriceKrwByIds}가 하고
	 * 여기선 가시성 게이트와 예산 대비만 얹는다 — 목록 카드와 이 상세가 같은 함수를 써야 같은 배치가
	 * 화면마다 다른 금액을 말하지 않는다.
	 */
	public EstimateResponse estimate(Long placementId, Long userId) {
		Placement placement = placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));

		long total = totalPriceKrwByIds(List.of(placementId)).getOrDefault(placementId, 0L);
		return EstimateResponse.of(total, placement.getBudgetKrw());
	}

	/**
	 * 배치별 합계 — <b>이 프로젝트에서 "데스크 값"을 세는 유일한 자리다</b>(REQ-REC-01). 아이템 합과
	 * 책상 가격을 집계 쿼리 두 방으로 읽어 더한다: 엔티티를 순회하면 제품마다 select가 나가 N+1이고,
	 * 카드마다 견적을 부르면 페이지 크기만큼 왕복이 는다(북마크·대표 상상도와 같은 형태).
	 *
	 * <p><b>가시성은 호출자가 이미 통과시켰다고 본다</b> — 상세는 {@code findVisibleById}, 목록은
	 * 목록 쿼리의 {@code visibleTo}다. 여기에 조건을 한 벌 더 두지 않는다.
	 *
	 * <p>아이템도 제품 모드 책상도 없는 배치는 <b>맵에 아예 없다</b> — 호출자가 0으로 채운다
	 * ({@code getOrDefault}). 0을 넣어 돌려주려면 id 전체를 한 번 더 순회해야 하는데, 어차피 모든
	 * 호출자가 기본값을 쓴다.
	 */
	public Map<Long, Long> totalPriceKrwByIds(List<Long> placementIds) {
		if (placementIds.isEmpty()) {
			return Map.of();
		}
		Map<Long, Long> totals = HashMap.newHashMap(placementIds.size());
		addRows(totals, placements.findItemPriceSumRows(placementIds));
		addRows(totals, placements.findDeskPriceRows(placementIds, SpecSource.PRODUCT));
		return totals;
	}

	/** 두 집계 결과를 같은 맵에 겹쳐 더한다 — 아이템만 있는 배치도, 책상만 있는 배치도 있다. */
	private void addRows(Map<Long, Long> totals, List<Object[]> rows) {
		for (Object[] row : rows) {
			long placementId = ((Number) row[0]).longValue();
			totals.merge(placementId, ((Number) row[1]).longValue(), Long::sum);
		}
	}
}
