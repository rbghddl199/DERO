'use client';
// 우측 견적서 팝업 — 배치된 제품을 spec 단위로 묶어 이미지·수량·가격을 보여준다. 좌측
// 카테고리 레일이 아니라 화면 우측에 상시 노출된다(2026-08-03, REQ-REC-01 유지). 닫기
// 버튼은 없다(2026-08-05 제거). 펼침 상태는 왼쪽 바깥의 화살표 손잡이(`estimate-fold-btn`,
// `@/assets/icons/arrow_right.svg` — 2026-08-07 arrow_left에서 교체, 접는 방향(패널을 오른쪽
// 벽 쪽으로 밀어 넣는 방향)을 가리키도록)로 접고, 접힘 상태는 우측 상단의 원형 배지(아이콘,
// 2026-08-07 이전엔 "₩" 텍스트)로 되돌린다(2026-08-06 개정 — 이전엔 접힘도 같은 얇은
// 띠+화살표 조합이었다). 시뮬레이터의 다른
// 팝업(좌측 레일 플라이아웃)에는 이 손잡이가 없다 — 사용자 확인: "왼쪽 tool bar에는 <
// 버튼 없애줘. 오른쪽 컨테이너에만 넣어줘." 체크박스로 제품 한 줄(수량 전체)을 합계에서
// 제외할 수 있다. 가격 없는 제품(자작·GLB 라이브러리)은 항상 제외. 카테고리별 보기는
// 2026-08-06 삭제(사용자 요청) — 목록은 항상 전체 평면 목록.

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { PlacedItem } from '@/three/scene/scene';
import type { DeskConfig } from '@/three/core/deskConfig';
import { getProduct } from '@/three/scene/product';
import ProductCategoryIcon from '@/components/product/ProductCategoryIcon';
import RemoteImage from '@/components/common/RemoteImage';
import { useSimulatorStore } from '@/store/simulatorStore';
import {
  EstimateBudgetRows,
  usePlacementEstimate,
} from '@/components/common/PlacementEstimateSummary';
import ArrowRightIcon from '@/assets/icons/arrow_right.svg';
import InvoiceIcon from '@/assets/icons/invoice.svg';

/** 'collapsed'는 견적서 전체를 언마운트하고 원형 배지 하나만 남긴다(2026-08-06 개정,
 *  사용자 요청 "견적서를 닫으면 우측 상단에 동그라미로 돈 표시가 원 형태로만 뜨게. 그걸
 *  누르면 팝업이 됨" — 이전엔 얇은 세로 띠 + 옆의 화살표 손잡이 조합이었다). 안쪽 콘텐츠만
 *  줄이고 부모 패널 크기를 그대로 두면 "빈 투명한 창"이 남는 문제로 폐기된 전례가 있다
 *  (LibraryPanel 지속 이슈 참고) — 그래서 접힘도 서브트리를 통째로 다른 엘리먼트로
 *  바꿔치기한다. 닫기(완전히 숨기는 세 번째 상태)는 2026-08-05 제거됐다. */
type PanelState = 'expanded' | 'collapsed';

/** 견적서 한 줄. **ProductSpec이 아니다** — 직접 입력 규격 책상은 제품이 아니라 spec 자체가
 *  없는데도 0원 줄로 떠야 하기 때문(D18). 가짜 ProductSpec을 조립하면 상세 링크와 썸네일이
 *  동시에 404가 된다. */
interface EstimateGroup {
  /** 합계 제외 토글 키이자 /product 라우트 param */
  id: string;
  name: string;
  imageUrl?: string;
  /** undefined = 가격 미정(자작·GLB, 합계 제외) / 0 = 직접 입력 규격 책상 */
  priceKrw?: number;
  qty: number;
  /** 카탈로그 제품만 상세 페이지가 있다 */
  linkable: boolean;
}

/** 직접 입력 규격 책상 줄의 id — 실 제품 id는 숫자 문자열이라 겹치지 않는다. */
const CUSTOM_DESK_ID = 'custom-desk';

// 실 카탈로그 제품은 imageUrl(대표 실사 이미지)을 우선한다 — 없으면(mock 카탈로그) 기존
// 빌드타임 정적 PNG로 폴백한다 (DERO-325, ADR-0017 결정 1).
const thumbnailUrl = (group: EstimateGroup): string =>
  group.imageUrl ?? `/assets/thumbnails/${group.id}.png`;
const formatKrw = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

export const groupBySpec = (items: PlacedItem[]): EstimateGroup[] => {
  const byId = new Map<string, EstimateGroup>();
  items.forEach(({ spec }) => {
    const existing = byId.get(spec.id);
    if (existing) existing.qty += 1;
    else
      byId.set(spec.id, {
        id: spec.id,
        name: spec.name,
        imageUrl: spec.imageUrl,
        priceKrw: spec.priceKrw,
        qty: 1,
        linkable: true,
      });
  });
  return Array.from(byId.values());
};

/** 책상은 배치 아이템이 아니라 씬의 단일 상태(DeskConfig)라 따로 조립한다. 직접 입력 규격은
 *  제품이 아니므로 0원 — 서버 견적(PlacementEstimateService)의 D18 규칙과 같은 값이라 캔버스
 *  합계와 "저장된 배치 기준" 합계가 어긋나지 않는다. 제품 책상인데 카탈로그에 spec이 없으면
 *  줄을 만들지 않는다(카탈로그 전반의 "씬을 죽이지 않는다" 원칙). */
export const deskGroup = (config: DeskConfig | null): EstimateGroup | null => {
  if (!config) return null;
  if (config.source === 'custom') {
    return { id: CUSTOM_DESK_ID, name: '직접 입력 책상', priceKrw: 0, qty: 1, linkable: false };
  }
  const spec = config.productId ? getProduct(config.productId) : undefined;
  if (!spec) return null;
  return {
    id: spec.id,
    name: spec.name,
    imageUrl: spec.imageUrl,
    priceKrw: spec.priceKrw,
    qty: 1,
    linkable: true,
  };
};

/** 합계 계산 정본 — 가격 미정(자작·GLB 라이브러리)과 사용자가 체크를 끈 제품은 둘 다
 *  빠진다(REQ-REC-01). */
export const sumGroups = (groups: EstimateGroup[], excluded: Record<string, boolean>): number =>
  groups.reduce((sum, group) => {
    if (group.priceKrw === undefined || excluded[group.id]) return sum;
    return sum + group.priceKrw * group.qty;
  }, 0);

const EstimateRow = ({ group }: { group: EstimateGroup }) => {
  const excluded = useSimulatorStore((s) => s.excludedEstimateProductIds[group.id] ?? false);
  const toggleEstimateExclusion = useSimulatorStore((s) => s.toggleEstimateExclusion);
  const unitPrice = group.priceKrw;
  const included = unitPrice !== undefined && !excluded;
  const subtotal = unitPrice !== undefined ? unitPrice * group.qty : undefined;

  const details = (
    <>
      {/* 직접 입력 규격 책상은 제품이 아니라 대표 이미지가 없다 — 썸네일 폴백 경로
          (/assets/thumbnails/{id}.png)도 404라 카테고리 라인 아이콘으로 대신한다.
          36px는 .estimate-thumb의 CSS 크기와 맞춘 값이다. */}
      {group.id === CUSTOM_DESK_ID ? (
        <ProductCategoryIcon category="desk" width={36} height={36} className="estimate-thumb" />
      ) : (
        <RemoteImage
          className="estimate-thumb"
          src={thumbnailUrl(group)}
          alt={group.name}
          width={36}
          height={36}
          draggable={false}
        />
      )}
      <span className={unitPrice === undefined ? 'estimate-name muted' : 'estimate-name'}>
        {group.name}
      </span>
      <span className="estimate-qty tnum">x{group.qty}</span>
      <span
        className={unitPrice === undefined ? 'estimate-price tnum muted' : 'estimate-price tnum'}
      >
        {subtotal === undefined ? '가격 미정' : formatKrw(subtotal)}
      </span>
    </>
  );

  return (
    <div className="estimate-row" data-testid={`estimate-item-${group.id}`}>
      <input
        type="checkbox"
        className="estimate-checkbox"
        checked={included}
        disabled={unitPrice === undefined}
        aria-label={`${group.name} 합계 포함`}
        data-testid={`estimate-include-${group.id}`}
        onChange={() => toggleEstimateExclusion(group.id)}
      />
      {/* 가격 미정(자작·GLB 라이브러리)은 /product/[productId]에 대응 항목이 없다
          (getProduct()가 PRODUCTS만 찾는다) — 그 경우엔 링크 없이 같은 모양으로만 둔다.
          직접 입력 규격 책상(linkable=false)도 같다: 제품이 아니라 상세 페이지가 없다.
          시뮬레이터를 떠나지 않도록 새 탭으로 연다(SelectedItemPanel의 "구매하기"와 같은
          target="_blank" 규칙, 2026-08-06 사용자 요청 "견적서의 상품들 클릭시 해당 상품
          상세 페이지로 이동"). */}
      {!group.linkable || unitPrice === undefined ? (
        <div className="estimate-row-link">{details}</div>
      ) : (
        <Link
          href={`/product/${group.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="estimate-row-link"
          data-testid={`estimate-link-${group.id}`}
        >
          {details}
        </Link>
      )}
    </div>
  );
};

const FlatList = ({ groups }: { groups: EstimateGroup[] }) => (
  <div className="estimate-list">
    {groups.map((group) => (
      <EstimateRow key={group.id} group={group} />
    ))}
  </div>
);

const EstimatePanel = () => {
  const sim = useSimulatorStore((s) => s.sim);
  // placedVersion 자체는 화면에 안 쓰지만 구독해야 배치 변경마다 sim.placed()를 다시 읽는다.
  useSimulatorStore((s) => s.placedVersion);
  const excludedEstimateProductIds = useSimulatorStore((s) => s.excludedEstimateProductIds);
  // 서버 견적(REQ-REC-01) — 저장된 배치에만 붙는다. 위의 합계는 아직 저장 안 된 캔버스 상태와
  // 체크박스 제외를 반영하는 "지금 화면" 값이고, 이건 GET /placements/{id}/estimate가 돌려준
  // "마지막 저장 기준" 값이라 둘이 다를 수 있다 — 그래서 라벨로 구분해 따로 보여준다. 예산 대비는
  // 서버만 답할 수 있어(placement.budget_krw + 저장된 아이템) 여기서만 나온다.
  const placementId = useSimulatorStore((s) => s.placementId);
  const lastSavedAt = useSimulatorStore((s) => s.lastSavedAt);
  const serverEstimate = usePlacementEstimate(placementId, lastSavedAt);
  const [panelState, setPanelState] = useState<PanelState>('expanded');

  const placedItems = sim ? sim.placed() : [];
  // 책상이 목록 맨 앞이다 — 배치의 바닥이자 보통 가장 비싼 항목이라 먼저 읽혀야 한다.
  const desk = deskGroup(sim ? sim.deskConfig() : null);
  const groups = desk ? [desk, ...groupBySpec(placedItems)] : groupBySpec(placedItems);
  const itemCount = placedItems.length + (desk ? 1 : 0);
  const total = sumGroups(groups, excludedEstimateProductIds);

  if (panelState === 'collapsed') {
    return (
      <button
        type="button"
        className="estimate-collapsed-badge"
        data-testid="estimate-fold"
        aria-label="견적서 펼치기"
        aria-expanded={false}
        onClick={() => setPanelState('expanded')}
      >
        <Image src={InvoiceIcon} alt="" width={20} height={20} />
      </button>
    );
  }

  return (
    <div className="glass hud editor-estimate-panel" data-testid="estimate-panel">
      {/* 왼쪽 테두리 선에 절반 겹치는 불투명 원형 손잡이(2026-08-07 재조정 — 2026-08-05엔
          완전히 바깥으로 떨어뜨렸었으나 사용자 요청 "버튼은 견적서 컨테이너 왼쪽 선 가운데에
          겹치게"로 되돌림). 접힘 쪽은 2026-08-06 원형 배지로 교체돼 이 버튼은 이제 펼침
          상태의 "접기" 전용 — 화살표는 접는 방향(오른쪽)을 가리킨다. */}
      <button
        type="button"
        className="estimate-fold-btn"
        data-testid="estimate-fold"
        aria-label="견적서 접기"
        aria-expanded={true}
        onClick={() => setPanelState('collapsed')}
      >
        <Image src={ArrowRightIcon} alt="" width={14} height={14} />
      </button>

      <div className="estimate-panel-header">
        <div className="estimate-title-group">
          <Image src={InvoiceIcon} alt="" width={18} height={18} />
          <span id="estimate-title" className="h2">
            견적서
          </span>
          <span className="count-tag" data-testid="estimate-item-count">
            총 {itemCount}개
          </span>
        </div>
      </div>

      <div className="estimate-panel-body">
        {groups.length === 0 ? (
          <p className="lib-empty">배치된 제품이 없습니다</p>
        ) : (
          <>
            <FlatList groups={groups} />
            <div className="estimate-total-row" data-testid="estimate-total">
              <span>합계</span>
              <span className="tnum">{formatKrw(total)}</span>
            </div>
          </>
        )}

        {/* 저장된 배치에만 붙는 서버 견적(REQ-REC-01). 위 합계는 저장 전 캔버스 + 체크박스 제외를
            반영한 "지금 화면" 값이라 값이 갈릴 수 있어 라벨로 구분한다 — 예산 대비는 서버만
            답할 수 있다(placement.budget_krw는 저장된 배치의 값이다). */}
        {serverEstimate !== null && (
          <div className="estimate-server-block" data-testid="estimate-server">
            <p className="estimate-server-label">저장된 배치 기준</p>
            <EstimateBudgetRows estimate={serverEstimate} compact />
          </div>
        )}
      </div>
    </div>
  );
};

export default EstimatePanel;
