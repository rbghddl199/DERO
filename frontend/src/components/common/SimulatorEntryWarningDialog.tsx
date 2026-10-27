'use client';
// 시뮬레이터 진입 전 하드웨어 가속 OFF 경고 — /craft·/collection처럼 three/bootstrap/style.css가
// 로드되지 않는 화면에서 쓴다(그 스타일시트는 /simulator에서만 불러오는 전역 리셋이라 여기서
// 가져다 쓰면 html/body 레이아웃이 깨진다 — 그래서 시뮬레이터 HUD의 HardwareAccelDialog를
// 재사용하지 않고 Tailwind로 새로 그린다). 안내 문구는 utils/hardwareAccelGuides.tsx를 공유해
// 두 다이얼로그의 문구가 갈라지지 않게 한다. 진입 여부는 두 버튼으로 가른다
// (useSimulatorEntryGuard): 위쪽 노란 버튼은 닫기만 하고 페이지에 머물고, 아래쪽 회색 버튼은
// 원래 가려던 화면으로 그대로 들어간다.

import { useEffect, useState } from 'react';
import BodyPortal from '@/components/common/BodyPortal';
import { sortGuidesByCurrentBrowser } from '@/utils/hardwareAccelGuides';
import type { BrowserKind, GpuAccelerationStatus } from '@/utils/hardwareAcceleration';

type Props = {
  status: GpuAccelerationStatus;
  browserKind: BrowserKind;
  onClose: () => void;
  onProceedAnyway: () => void;
};

const SimulatorEntryWarningDialog = ({ status, browserKind, onClose, onProceedAnyway }: Props) => {
  const [copiedKind, setCopiedKind] = useState<BrowserKind | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const guides = sortGuidesByCurrentBrowser(browserKind);

  const copyAddress = (kind: BrowserKind, address: string): void => {
    navigator.clipboard
      .writeText(address)
      .then(() => setCopiedKind(kind))
      .catch(() => setCopiedKind(null));
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sim-entry-warning-title"
          className="scrollbar-primary max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-2xl bg-white p-5 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <h2
            id="sim-entry-warning-title"
            className="text-ink text-center text-[20px] font-semibold"
          >
            하드웨어 가속 설정
          </h2>

          <p className="text-ash mt-3 text-[14px] font-bold">
            현재 상태: {status.accelerated ? '켜짐 (ON)' : '꺼짐 (OFF)'}
          </p>
          <p className="text-danger-500 mt-0.5 text-[13px] leading-[1.5] font-bold">
            원활한 작업실 환경을 위해서는 하드웨어 가속을 ON으로 하는 것을 권장합니다
          </p>

          <p className="text-ash mt-3 text-[14px] leading-[1.5]">
            브라우저 보안 정책상 웹 페이지에서 이 설정을 직접 바꿀 수는 없어요. 아래 주소를 복사해
            주소창에 붙여넣고 설정을 바꾼 뒤, 브라우저를 다시 시작하면 적용됩니다.
          </p>

          <ul className="mt-3 flex flex-col gap-2.5">
            {guides.map((guide) => (
              <li key={guide.kind} className="border-ash/20 rounded-[10px] border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink flex items-center gap-1.5 text-[14px] font-bold">
                    {guide.label}
                    {guide.kind === browserKind && (
                      <span className="text-primary-600 rounded-full border border-current px-1.5 py-px text-[11px] font-semibold">
                        사용 중
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyAddress(guide.kind, guide.address)}
                    className="bg-fog hover:bg-highlight text-ink shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors"
                  >
                    {copiedKind === guide.kind ? '복사됨' : '주소 복사'}
                  </button>
                </div>
                <code className="bg-fog mt-1.5 block rounded-md px-2 py-1 text-[12px] select-all">
                  {guide.address}
                </code>
                <p className="text-ash mt-1 text-[12px] leading-[1.5]">{guide.steps}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-primary-400 hover:bg-primary-500 text-ink rounded-xl py-3 text-[15px] font-semibold transition-colors"
            >
              설정 후에 다시 진행(닫기)
            </button>
            <button
              type="button"
              onClick={onProceedAnyway}
              className="bg-fog hover:bg-highlight text-ink rounded-xl py-3 text-[15px] font-medium transition-colors"
            >
              무시하고 진행
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default SimulatorEntryWarningDialog;
