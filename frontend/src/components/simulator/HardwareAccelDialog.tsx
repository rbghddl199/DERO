'use client';
// 하드웨어(그래픽) 가속 안내 모달 — 상단 바의 가속 표시등을 눌렀을 때 뜬다. 브라우저 보안
// 정책상 웹 페이지가 이 설정을 직접 켜고 끌 수는 없으므로(chrome:// 페이지로의 이동조차
// 차단된다), 감지된 현재 상태 + 브라우저별 설정 경로 안내 + 주소 복사 버튼까지가 웹에서
// 가능한 전부다. 감지 로직은 utils/hardwareAcceleration.ts, 안내 문구는
// utils/hardwareAccelGuides.tsx(/craft·/collection의 SimulatorEntryWarningDialog와 공유).

import { useEffect } from 'react';
import { useSimulatorStore } from '@/store/simulatorStore';
import { sortGuidesByCurrentBrowser } from '@/utils/hardwareAccelGuides';
import type { BrowserKind, GpuAccelerationStatus } from '@/utils/hardwareAcceleration';

type Props = {
  status: GpuAccelerationStatus | null;
  browserKind: BrowserKind;
  onClose: () => void;
};

const HardwareAccelDialog = ({ status, browserKind, onClose }: Props) => {
  const showToast = useSimulatorStore((s) => s.showToast);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const guides = sortGuidesByCurrentBrowser(browserKind);

  const copyAddress = (address: string): void => {
    navigator.clipboard
      .writeText(address)
      .then(() => showToast('주소를 복사했어요. 주소창에 붙여넣으세요.'))
      .catch(() => showToast('복사하지 못했어요. 주소를 직접 입력해 주세요.'));
  };

  return (
    <div className="modal-overlay" data-testid="hwaccel-overlay" onClick={onClose}>
      <div
        className="glass modal-card hwaccel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hwaccel-title"
        data-testid="hwaccel-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="hwaccel-title" className="h2">
          하드웨어 가속 설정
        </div>

        <p className={status?.accelerated ? 'hwaccel-status on' : 'hwaccel-status'}>
          현재 상태: {status === null ? '확인 중' : status.accelerated ? '켜짐 (ON)' : '꺼짐 (OFF)'}
        </p>
        {/* 렌더러 원문 표기는 2026-08-06 요청으로 뺐다(일반 사용자에겐 소음) — 대신 권장 문구. */}
        <p className="hwaccel-recommend">
          원활한 작업실 환경을 위해서는 하드웨어 가속을 ON으로 하는 것을 권장합니다
        </p>

        <p className="muted">
          브라우저 보안 정책상 웹 페이지에서 이 설정을 직접 바꿀 수는 없어요. 아래 주소를 복사해
          주소창에 붙여넣고 설정을 바꾼 뒤, 브라우저를 다시 시작하면 적용됩니다.
        </p>

        <ul className="hwaccel-browser-list">
          {guides.map((guide) => (
            <li key={guide.kind} className="hwaccel-browser-row">
              <div className="hwaccel-browser-head">
                <span className="hwaccel-browser-name">
                  {guide.label}
                  {guide.kind === browserKind && (
                    <span className="hwaccel-current-badge">사용 중</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary hwaccel-copy-btn"
                  data-testid={`hwaccel-copy-${guide.kind}`}
                  onClick={() => copyAddress(guide.address)}
                >
                  주소 복사
                </button>
              </div>
              <code className="hwaccel-addr">{guide.address}</code>
              <p className="hwaccel-steps">{guide.steps}</p>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="hwaccel-close"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default HardwareAccelDialog;
