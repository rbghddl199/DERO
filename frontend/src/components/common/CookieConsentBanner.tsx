'use client';
// 쿠키 동의 배너 — 결정 전까지 유지되고(자동 dismiss 없음), 동의해야만 GA 스크립트가 뜬다.
// cookieConsentStore는 skipHydration:true라 마운트 직후엔 아직 localStorage 복원 전일 수 있다 —
// 복원 전에 배너를 잠깐 보여주면(이미 결정한 사용자에게) 깜빡임이 되므로 하이드레이션 완료까지
// 기다린다(LikedProductsPanel.useLikesHydrated와 같은 이유·같은 구현).

import { useEffect, useState } from 'react';
import { useCookieConsentStore } from '@/store/cookieConsentStore';
import BodyPortal from './BodyPortal';

const CookieConsentBanner = () => {
  const decision = useCookieConsentStore((state) => state.decision);
  const setDecision = useCookieConsentStore((state) => state.setDecision);
  const [isHydrated, setIsHydrated] = useState(() => useCookieConsentStore.persist.hasHydrated());

  useEffect(() => {
    if (isHydrated) return;
    if (useCookieConsentStore.persist.hasHydrated()) {
      const timer = setTimeout(() => setIsHydrated(true), 0);
      return () => clearTimeout(timer);
    }
    return useCookieConsentStore.persist.onFinishHydration(() => setIsHydrated(true));
  }, [isHydrated]);

  if (!isHydrated || decision !== null) return null;

  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-label="쿠키 사용 동의"
        className="bg-ink text-paper fixed inset-x-4 bottom-6 z-50 flex flex-col gap-3 rounded-2xl px-5 py-4 text-[15px] shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2 sm:flex-row sm:items-center sm:justify-between"
      >
        <span>서비스 개선을 위해 분석 쿠키를 사용합니다. 동의하시겠어요?</span>
        <div className="flex shrink-0 gap-4">
          <button
            type="button"
            onClick={() => setDecision('declined')}
            className="text-ash shrink-0 cursor-pointer font-medium"
          >
            거부
          </button>
          <button
            type="button"
            onClick={() => setDecision('accepted')}
            className="text-primary-500 shrink-0 cursor-pointer font-medium"
          >
            동의
          </button>
        </div>
      </div>
    </BodyPortal>
  );
};

export default CookieConsentBanner;
