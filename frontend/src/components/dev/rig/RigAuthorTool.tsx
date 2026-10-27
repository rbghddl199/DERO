'use client';
// 리그 저작 도구 화면 조립 — 상단 바 / 좌 파트 패널 · 3D 캔버스 · 우 관절 패널 / 하단 포즈 바 + 토스트

import { useRigDraftStore } from '@/store/rigDraftStore';
import RigCanvas from './RigCanvas';
import RigJointPanel from './RigJointPanel';
import RigPartPanel from './RigPartPanel';
import RigPoseBar from './RigPoseBar';
import RigTopBar from './RigTopBar';

const RigAuthorTool = () => {
  const toast = useRigDraftStore((s) => s.toast);

  return (
    // 전역 TopNavbar(h-16) 아래를 꽉 채운다 — 데브 라우트라 별도 레이아웃을 만들지 않는다.
    <div className="relative flex h-[calc(100vh-4rem)] flex-col overflow-hidden text-neutral-800">
      <RigTopBar />
      <div className="flex min-h-0 flex-1">
        <RigPartPanel />
        <div className="min-w-0 flex-1">
          <RigCanvas />
        </div>
        <RigJointPanel />
      </div>
      <RigPoseBar />
      {toast && (
        <p className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-3 py-1 text-xs text-white">
          {toast}
        </p>
      )}
    </div>
  );
};

export default RigAuthorTool;
