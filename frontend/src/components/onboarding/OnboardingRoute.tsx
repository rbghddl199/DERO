// /onboarding 진입 — 닉네임 → 약관 2단계를 잇고, 끝나면 세션을 다시 읽어 원래 목적지로 보낸다.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import NicknameStep from '@/components/onboarding/NicknameStep';
import TermsStep from '@/components/onboarding/TermsStep';
import { authRuntime } from '@/components/auth/authRuntime';
import { useAuthStore } from '@/store/authStore';
import { trackEvent } from '@/utils/analytics';
import { sanitizeReturnTo } from '@/utils/auth/returnTo';

type Step = 'nickname' | 'terms';

const OnboardingRoute = () => {
  const router = useRouter();
  const auth = useAuthStore((state) => state.auth);
  const [step, setStep] = useState<Step>('nickname');
  const [isDone, setIsDone] = useState(false);

  const session = auth.status === 'authenticated' ? auth.session : null;
  const onboardingRequired = session?.onboardingRequired ?? true;

  // useSearchParams()를 쓰지 않는다 — Suspense 경계가 필요하고 이 프로젝트의 dev 환경에서
  // 하이드레이션을 깨뜨린다(AuthGate·MypageShell과 같은 이유).
  const returnTo =
    typeof window === 'undefined'
      ? '/'
      : sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));

  // 이미 온보딩을 마친 계정이면 이 화면 자체가 뜨지 않는다 — 재로그인 때 다시 묻지 않는 자리다.
  useEffect(() => {
    if (session !== null && !onboardingRequired) {
      router.replace(returnTo);
    }
  }, [session, onboardingRequired, returnTo, router]);

  if (session === null || !onboardingRequired || isDone) {
    return null;
  }

  const handleAgreed = () => {
    setIsDone(true);
    trackEvent('sign_up', { method: 'onboarding' });
    // 파생값(onboardingRequired)을 서버에서 다시 읽어 store를 갱신한 뒤 이동한다 —
    // 갱신 전에 이동하면 위 effect가 아직 true를 보고 되돌린다.
    void authRuntime.refreshSession().then(() => {
      router.replace(returnTo);
    });
  };

  return (
    <div data-onboarding-step-current={step} className="w-full max-w-[480px]">
      {step === 'nickname' ? (
        <NicknameStep initialNickname={session.name} onSaved={() => setStep('terms')} />
      ) : (
        <TermsStep onAgreed={handleAgreed} />
      )}
    </div>
  );
};

export default OnboardingRoute;
