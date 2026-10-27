'use client';
// 시뮬레이션 HUD — 상단 툴바(EditorTopBar) + 좌측 카테고리 레일(EditorSidebar) +
// 우측 선택 상세 패널(SelectedItemPanel) + 우측 견적서 팝업(EstimatePanel, 2026-08-03
// 좌측 레일에서 이동) + 선택 아이템 위에 뜨는 부동 툴바(SelectionToolbar)를 조립하고
// 경고 배너 · 저장 토스트 · 결합 배너를 배치한다. 부동 툴바는 2026-08-03 폐기됐다가
// 2026-08-04 복구 — 조작 중 좌표를 동결해 폐기 사유(동반 상승)만 도려냈다(ADR-0023 결정 6).
// 참고: 오늘의집류 3D 플래너 에디터 레이아웃(2026-07-27 개정).
// 전체 화면 중에는 이 HUD 셋을 전부 숨긴다 — 나가는 길은 ESC(브라우저 자체 전체화면
// 해제)뿐이다(2026-07-27).

import { useSimulatorStore } from '@/store/simulatorStore';
import EditorTopBar from './EditorTopBar';
import EditorSidebar from './EditorSidebar';
import SelectedItemPanel from './SelectedItemPanel';
import EstimatePanel from './EstimatePanel';
import SelectionToolbar from './SelectionToolbar';
import MountBanner from './MountBanner';
import SimulatorCoachTour from './SimulatorCoachTour';

const SimHud = () => {
  const warning = useSimulatorStore((s) => s.warning);
  const saveViolations = useSimulatorStore((s) => s.saveViolations);
  const toast = useSimulatorStore((s) => s.toast);
  const assetLoading = useSimulatorStore((s) => s.assetLoading);
  const isFullscreen = useSimulatorStore((s) => s.isFullscreen);

  return (
    <section className="screen screen-sim active" data-testid="screen-sim">
      {!isFullscreen && (
        <>
          <EditorTopBar />
          <EditorSidebar />
          <div className="editor-right-column">
            <EstimatePanel />
            <SelectedItemPanel />
          </div>
          <SelectionToolbar />
          <SimulatorCoachTour />
        </>
      )}

      <div
        className={warning.on ? 'warn-banner' : 'warn-banner hidden'}
        data-testid="collision-warning"
      >
        {warning.msg || '⚠ 오브젝트가 겹칩니다 — 배치를 조정하세요'}
      </div>

      <MountBanner />

      {saveViolations.length > 0 && (
        <div className="violation-banner" role="status" data-testid="save-violations">
          <p className="violation-banner-title">
            저장은 됐지만 규격 위반 {saveViolations.length}건이 남아 있어요 — 이대로는 컬렉션에
            업로드할 수 없습니다.
          </p>
          <ul className="violation-banner-reasons">
            {saveViolations.map((violation) => (
              <li key={`${violation.code}-${violation.itemId ?? 'placement'}`}>
                {violation.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={toast ? 'toast' : 'toast hidden'} data-testid="save-toast">
        {toast}
      </div>

      {/* 드롭한 제품의 GLB 첫 로드 대기 칩 — 캐시 히트는 CSS 지연 페이드(0.15s) 안에
          끝나 화면에 아예 안 보인다. 마크업·클래스는 LibraryPanel의 .spinner 재사용. */}
      {assetLoading && (
        <div className="asset-loading-chip" role="status" data-testid="asset-loading">
          <svg className="spinner" viewBox="0 0 44 44" aria-hidden="true">
            <circle className="spinner-track" cx="22" cy="22" r="18" />
            <circle className="spinner-arc" cx="22" cy="22" r="18" />
          </svg>
          제품 모델 불러오는 중…
        </div>
      )}
    </section>
  );
};

export default SimHud;
