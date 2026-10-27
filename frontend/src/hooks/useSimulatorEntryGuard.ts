'use client';
// 시뮬레이터(또는 그 진입 흐름)로 넘어가기 전 하드웨어 가속 OFF를 경고한다 — 켜져 있으면
// 그대로 통과, 꺼져 있으면 진입을 막고 HardwareAccelDialog를 두 버튼(설정 후 재진입 /
// 무시하고 진행)으로 띄운다. 가속 감지는 매 클릭마다 새로 한다(utils/hardwareAcceleration.ts,
// 1회용 WebGL 프로브라 비용이 작다) — 사용자가 다이얼로그를 보고 실제로 설정을 바꿨을 수 있다.

import { useCallback, useState } from 'react';
import {
  detectBrowserKind,
  detectGpuAcceleration,
  type BrowserKind,
  type GpuAccelerationStatus,
} from '@/utils/hardwareAcceleration';

type PendingEntry = {
  status: GpuAccelerationStatus;
  browserKind: BrowserKind;
  proceed: () => void;
};

export function useSimulatorEntryGuard() {
  const [pending, setPending] = useState<PendingEntry | null>(null);

  const guardEntry = useCallback((proceed: () => void): void => {
    const status = detectGpuAcceleration();
    if (status.accelerated) {
      proceed();
      return;
    }
    setPending({ status, browserKind: detectBrowserKind(), proceed });
  }, []);

  const cancel = useCallback((): void => setPending(null), []);

  const proceedAnyway = useCallback((): void => {
    pending?.proceed();
    setPending(null);
  }, [pending]);

  return { pending, guardEntry, cancel, proceedAnyway };
}
