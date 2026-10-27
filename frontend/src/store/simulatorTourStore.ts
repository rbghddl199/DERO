// 시뮬레이터 첫 입장 코치마크 투어 상태 — 본 적 있는지(seen, localStorage 유지)와
// 지금 진행 중인지(active·stepIndex, 세션 한정)를 분리해서 들고 있다. 분기 로직은 전부
// utils/simulatorTour.ts에 있고 이 파일은 그걸 set으로 옮기기만 한다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mapSetJsonStorage } from '@/store/mapSetJsonStorage';
import { advanceTour, endTour, TOUR_STEP_COUNT, type TourSession } from '@/utils/simulatorTour';

type SimulatorTourStore = TourSession & {
  /** 시작 조건(shouldStartTour) 판정은 호출부 책임 — 여기선 이미 본 사람만 막는다. */
  start: () => void;
  next: () => void;
  /** 건너뛰기·ESC·마지막 단계 완료 공통 경로. */
  end: () => void;
  /** 시뮬레이터 재진입 시 진행 상태만 초기화한다 — seen은 건드리지 않는다. */
  resetForMount: () => void;
};

const toSession = (state: TourSession): TourSession => ({
  active: state.active,
  stepIndex: state.stepIndex,
  seen: state.seen,
});

export const useSimulatorTourStore = create<SimulatorTourStore>()(
  persist(
    (set, get) => ({
      seen: false,
      active: false,
      stepIndex: 0,

      start: () => {
        const state = get();
        if (state.seen || state.active) return;
        set({ active: true, stepIndex: 0 });
      },

      next: () => set(advanceTour(toSession(get()), TOUR_STEP_COUNT)),

      end: () => set(endTour(toSession(get()))),

      resetForMount: () => set({ active: false, stepIndex: 0 }),
    }),
    {
      name: 'dero-simulator-tour',
      // Map·Set을 안 쓰지만 mapSetJsonStorage는 그 외 값을 그대로 통과시키는 SSR-safe(window 가드)
      // JSON 스토리지라 다른 persist 스토어와 같이 재사용한다.
      storage: mapSetJsonStorage,
      // 자동 복원은 SSR과 첫 클라이언트 렌더를 어긋나게 한다 — PersistedInteractionsBootstrap이
      // 마운트 후 수동으로 rehydrate한다(frontend/CLAUDE.md 지속 이슈).
      skipHydration: true,
      // 진행 상태(active·stepIndex)는 남기지 않는다 — 새로고침하면 처음부터 다시 본다.
      partialize: (state) => ({ seen: state.seen }),
      version: 1,
    },
  ),
);
