// 온보딩(닉네임·약관) 고정 라우트 — 로그인 직후 onboardingRequired가 true면 여기로 온다.

import type { Metadata } from 'next';

import AuthGate from '@/components/auth/AuthGate';
import OnboardingRoute from '@/components/onboarding/OnboardingRoute';

export const metadata: Metadata = {
  title: '시작하기 — 데스크테리어 시뮬레이터',
  description: '닉네임을 정하고 약관에 동의하면 서비스를 시작할 수 있습니다.',
};

const OnboardingPage = () => (
  <div className="bg-paper flex flex-1 items-center justify-center px-6 py-12">
    <AuthGate
      checkingLabel="로그인 상태 확인 중"
      anonymousDescription="온보딩을 이어가려면 먼저 로그인해 주세요."
    >
      <OnboardingRoute />
    </AuthGate>
  </div>
);

export default OnboardingPage;
