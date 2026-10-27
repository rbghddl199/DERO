'use client';
// 우측 선택 상세 패널 — 아이템을 선택하면 자동으로 뜨고 해제하면 자동으로 사라진다
// (참고: 오늘의집류 3D 플래너의 우측 "선택 상세 정보" 패널). 토글 버튼이 따로 없다.

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useProductLikesStore } from '@/store/productLikesStore';
import { safeExternalUrl } from '@/utils/externalUrl';
import LikeButton from '@/components/common/LikeButton';
import SelectionPanel from './SelectionPanel';
import JointPanel from './JointPanel';
import SidebarIcon from './SidebarIcon';

const SelectedItemPanel = () => {
  const selectedItemId = useSimulatorStore((s) => s.selectedItemId);
  const sim = useSimulatorStore((s) => s.sim);
  // placedVersion 자체는 화면에 안 쓰지만 구독해야 배치 변경마다 sim.placed()를 다시 읽는다
  // (EstimatePanel.tsx와 같은 이유).
  useSimulatorStore((s) => s.placedVersion);
  const likedIds = useProductLikesStore((s) => s.likedIds);
  const toggleLike = useProductLikesStore((s) => s.toggleLike);
  const requireAuth = useRequireAuth();
  const isAuthenticated = useIsAuthenticated();

  if (!selectedItemId) return null;

  // SelectionPanel.tsx와 같은 방식(sim.placed().find)으로 spec을 다시 구한다 — store엔
  // selectedItemSpecId(문자열)만 있고 priceKrw 등 spec 전체는 없다.
  const selectedSpec = sim?.placed().find((i) => i.id === selectedItemId)?.spec ?? null;
  // 가격 미정(자작·GLB 라이브러리)은 좋아요 대상이 아니다 — LikedProductsPanel.tsx·
  // EstimatePanel.tsx의 구매 링크 게이팅과 같은 기준(`priceKrw === undefined`).
  const isLikeable = selectedSpec?.priceKrw !== undefined;
  const isLiked = isLikeable && isAuthenticated && likedIds.has(selectedSpec.id);
  const purchaseUrl = safeExternalUrl(selectedSpec?.productUrl);

  const handleToggleLike = (): void => {
    if (!selectedSpec) return;
    if (!requireAuth()) return;
    toggleLike(selectedSpec.id);
  };

  return (
    <div className="glass hud editor-selected-panel" data-testid="editor-selected-panel">
      <SelectionPanel />
      {/* 조작 절(3축 정밀값 + 복제·삭제·해제)은 2026-08-04부터 다시 부동
          SelectionToolbar 소관이다 — 조작 중 좌표를 동결해 폐기 사유를 없앴다
          (ADR-0023 결정 6, REQ-SIM-35). */}
      <JointPanel />

      {/* 2026-08-05부터 패널 하단에 flush로 붙는 바가 아니라 보통 버튼처럼 부모
          (.editor-selected-panel)의 기본 패딩 안에 들어앉는다(사용자 요청).
          2026-08-07 좋아요 버튼 추가(사용자 요청, "구매하기 버튼 옆에") — 같은 줄에 나란히
          두려고 `.sel-actions`로 감쌌다(margin-top:auto가 이 래퍼로 옮겨감, 아래 CSS 참고).
          2026-08-03 전체 상품 목록(/product) 대신 제품별 외부 구매처(쿠팡 등)로 나간다(사용자
          요청) — `/product/[productId]` 상세의 '구매하러 가기'와 같은 productUrl이고, 값이
          없는 제품(자작·목업)은 버튼 자체를 안 그린다(ProductSpec.productUrl 주석). 외부
          도메인이라 next/link가 아니라 <a>, 시뮬레이터를 떠나지 않도록 새 탭. */}
      <div className="sel-actions">
        {purchaseUrl && (
          <a
            href={purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary sel-purchase"
            data-testid="purchase-item"
          >
            <SidebarIcon name="cart" width={16} height={16} />
            구매하기
          </a>
        )}
        {isLikeable && <LikeButton isLiked={isLiked} onToggle={handleToggleLike} size="lg" />}
      </div>
    </div>
  );
};

export default SelectedItemPanel;
