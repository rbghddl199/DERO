'use client';
// 조명 등록 도구 화면 조립 — 상단 바 / 3D 캔버스 · 우 판정 패널 + 토스트

import { useLightAuthorStore } from '@/store/lightAuthorStore';
import LightCanvas from './LightCanvas';
import LightOriginPanel from './LightOriginPanel';
import LightShadePanel from './LightShadePanel';
import LightTopBar from './LightTopBar';

const LightAuthorTool = () => {
  const toast = useLightAuthorStore((s) => s.toast);

  return (
    // 전역 TopNavbar(h-16) 아래를 꽉 채운다 — 데브 라우트라 별도 레이아웃을 만들지 않는다.
    <div className="relative flex h-[calc(100vh-4rem)] flex-col overflow-hidden text-neutral-800">
      <LightTopBar />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <LightCanvas />
        </div>
        <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-neutral-300 bg-white">
          <LightOriginPanel />
          <LightShadePanel />
        </aside>
      </div>
      {toast && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-3 py-1 text-xs text-white">
          {toast}
        </p>
      )}
    </div>
  );
};

export default LightAuthorTool;
