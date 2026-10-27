// 공통 Sign 화면의 OAuth 진입 Region을 조립한다.

import { Suspense } from 'react';

import AuthEntryRoute from '@/components/auth/AuthEntryRoute';
import LoadingState from '@/components/common/LoadingState';
import type { OAuthIntent } from '@/types/auth-ui';

export type SignPageProps = {
  intent: OAuthIntent;
};

const SIGN_COPY: Record<OAuthIntent, { loadingLabel: string; loadingDescription: string }> = {
  login: {
    loadingLabel: '로그인 화면 준비 중',
    loadingDescription: '소셜 로그인 선택지를 준비하고 있습니다.',
  },
  signup: {
    loadingLabel: '회원가입 화면 준비 중',
    loadingDescription: '소셜 회원가입 선택지를 준비하고 있습니다.',
  },
};

const SignPage = ({ intent }: SignPageProps) => {
  const copy = SIGN_COPY[intent];

  return (
    <div className="bg-paper flex flex-1 items-start justify-center overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:items-center lg:py-10">
      <section
        aria-label="소셜 계정으로 시작하기"
        data-sign-layout=""
        data-sign-region="oauth"
        className="bg-paper flex w-full max-w-[480px] items-center justify-center overflow-hidden px-6 py-10 sm:px-12 sm:py-12 [&_.shadow-lg]:shadow-none"
      >
        <Suspense
          fallback={
            <LoadingState label={copy.loadingLabel} description={copy.loadingDescription} />
          }
        >
          <AuthEntryRoute intent={intent} />
        </Suspense>
      </section>
    </div>
  );
};

export default SignPage;
