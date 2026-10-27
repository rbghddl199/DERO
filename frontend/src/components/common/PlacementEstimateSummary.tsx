'use client';
// 배치 견적 요약 — GET /placements/{id}/estimate의 값을 그대로 그린다(REQ-REC-01).
// 시뮬레이터 견적서와 배치 상세가 같은 조각을 쓴다: 두 화면이 각자 합계를 계산하면 같은 배치가
// 화면마다 다른 금액을 말하게 된다.
//
// **예산 초과는 색과 문구 둘 다로 구분한다** — 색만으로 구분하면 색각 이상 사용자에게 안 보인다.
// 예산 미설정(budgetKrw === null)이면 합계만 그린다: "0원 초과"로 읽힐 값을 만들지 않는다.
// `showBudget={false}`면 예산 줄 자체를 안 그린다 — 컬렉션 상세가 그렇다(남의 예산은 볼 이유가
// 없다, 2026-08-02 요청). 시뮬레이터 견적서는 기본값 그대로 예산·초과를 보여준다.

import { useEffect, useState } from 'react';
import { getPlacementEstimate } from '@/api/placement';
import type { PlacementEstimateResponse } from '@/types/placement';

const formatKrw = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

type Props = {
  placementId: number;
  /** 시뮬레이터 견적서처럼 좁은 패널에 들어갈 때 쓰는 촘촘한 배치. */
  compact?: boolean;
  /** false면 합계만 그린다 — 컬렉션 상세는 남의 예산·초과를 보여줄 이유가 없다(2026-08-02). */
  showBudget?: boolean;
};

/**
 * `refreshKey`가 바뀌면 다시 조회한다 — 시뮬레이터가 저장 시각(`lastSavedAt`)을 넘겨, 저장 직후
 * 견적이 옛 값을 붙들고 있지 않게 한다. 값 자체는 쓰지 않는다.
 */
export const usePlacementEstimate = (
  placementId: number | null,
  refreshKey?: number | null,
): PlacementEstimateResponse | null => {
  // 어느 배치의 값인지 함께 들고 있는다 — id가 바뀐 직후 한 프레임 동안 옛 배치의 금액이
  // 새 배치 이름 옆에 붙는 것을 막는다(effect 안에서 동기 setState를 하지 않으려는 것이기도 하다).
  const [loaded, setLoaded] = useState<{
    placementId: number;
    estimate: PlacementEstimateResponse;
  } | null>(null);

  useEffect(() => {
    if (placementId === null) return;
    let alive = true;
    // 남의 비공개 배치는 404다 — 그 경우 견적 영역을 그리지 않는 것이 맞는 동작이라 조용히 비운다.
    getPlacementEstimate(placementId)
      .then((estimate) => {
        if (alive) setLoaded({ placementId, estimate });
      })
      .catch(() => {
        if (alive) setLoaded(null);
      });
    return () => {
      alive = false;
    };
  }, [placementId, refreshKey]);

  return loaded !== null && loaded.placementId === placementId ? loaded.estimate : null;
};

/** 합계 + 예산 대비 두 줄. 예산이 없거나 `showBudget`이 false면 합계 한 줄이다. */
export const EstimateBudgetRows = ({
  estimate,
  compact = false,
  showBudget = true,
}: {
  estimate: PlacementEstimateResponse;
  compact?: boolean;
  showBudget?: boolean;
}) => {
  const { totalPriceKrw, budgetKrw, isOverBudget, differenceKrw } = estimate;
  const gap = compact ? 'gap-1' : 'gap-2';
  const totalSize = compact ? 'text-[14px]' : 'text-[16px]';

  return (
    <div className={`flex flex-col ${gap}`} data-testid="placement-estimate">
      <div className={`flex items-baseline justify-between ${totalSize}`}>
        <span className="text-ash">합계</span>
        <span className="text-ink font-semibold tabular-nums" data-testid="estimate-total-krw">
          {formatKrw(totalPriceKrw)}
        </span>
      </div>

      {showBudget && budgetKrw !== null && differenceKrw !== null && (
        <div
          className={`flex items-baseline justify-between text-[13px] ${
            isOverBudget ? 'text-danger-500 font-semibold' : 'text-ash'
          }`}
          data-testid="estimate-budget"
          data-over-budget={isOverBudget ? 'true' : 'false'}
        >
          <span>예산 {formatKrw(budgetKrw)}</span>
          <span className="tabular-nums">
            {isOverBudget
              ? `${formatKrw(-differenceKrw)} 초과`
              : `${formatKrw(differenceKrw)} 남음`}
          </span>
        </div>
      )}
    </div>
  );
};

/** 배치 id만 주면 조회까지 하는 형태. 응답이 오기 전이나 볼 수 없는 배치면 아무것도 그리지 않는다. */
const PlacementEstimateSummary = ({ placementId, compact = false, showBudget = true }: Props) => {
  const estimate = usePlacementEstimate(placementId);
  if (estimate === null) return null;
  return <EstimateBudgetRows estimate={estimate} compact={compact} showBudget={showBudget} />;
};

export default PlacementEstimateSummary;
