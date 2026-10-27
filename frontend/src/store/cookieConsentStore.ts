// 쿠키 동의 배너 상태 — GA 스크립트는 decision이 'accepted'일 때만 로드된다.
// simulatorTourStore와 같은 모양(단일 값 persist + skipHydration): 자동 복원은 SSR과 첫 클라이언트
// 렌더를 어긋나게 하므로, PersistedInteractionsBootstrap이 마운트 후 수동으로 rehydrate한다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mapSetJsonStorage } from '@/store/mapSetJsonStorage';

export type CookieConsentDecision = 'accepted' | 'declined' | null;

type CookieConsentStore = {
  decision: CookieConsentDecision;
  setDecision: (decision: CookieConsentDecision) => void;
};

export const useCookieConsentStore = create<CookieConsentStore>()(
  persist(
    (set) => ({
      decision: null,
      setDecision: (decision) => set({ decision }),
    }),
    {
      name: 'dero-cookie-consent',
      storage: mapSetJsonStorage,
      skipHydration: true,
      partialize: (state) => ({ decision: state.decision }),
      version: 1,
    },
  ),
);
