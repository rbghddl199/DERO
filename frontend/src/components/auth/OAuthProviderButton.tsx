// Google·Kakao OAuth 진입 동작을 상태별 접근성 피드백과 함께 제공한다.

'use client';

import Image from 'next/image';
import { useId } from 'react';

import type { OAuthIntent, OAuthProvider, OAuthProviderButtonStatus } from '@/types/auth-ui';

export type OAuthProviderButtonProps = {
  provider: OAuthProvider;
  intent: OAuthIntent;
  status?: OAuthProviderButtonStatus;
  errorMessage?: string;
  onActivate: (provider: OAuthProvider) => void;
};

const PROVIDER_PRESENTATION: Record<
  OAuthProvider,
  {
    name: string;
    icon: string;
    idleLabel: string;
    loadingLabel: string;
    retryLabel: string;
    className: string;
  }
> = {
  google: {
    name: 'Google',
    icon: '/assets/auth/google-g.svg',
    idleLabel: 'Google 로그인',
    loadingLabel: 'Google 로그인 중',
    retryLabel: 'Google로 다시 시도',
    className: 'bg-[#F2F2F2] text-neutral-900 hover:bg-[#E8E8E8]',
  },
  kakao: {
    name: '카카오',
    icon: '/assets/auth/kakao-login-symbol.svg',
    idleLabel: '카카오 로그인',
    loadingLabel: '카카오 로그인 중',
    retryLabel: '카카오 로그인 다시 시도',
    className: 'bg-[#FEE500] text-[#191919] hover:bg-[#F5DC00]',
  },
};

export const isOAuthProviderButtonActivationBlocked = (
  status: OAuthProviderButtonStatus,
): boolean => status === 'loading' || status === 'disabled';

const OAuthProviderButton = ({
  provider,
  intent,
  status = 'idle',
  errorMessage,
  onActivate,
}: OAuthProviderButtonProps) => {
  const errorId = useId();
  const presentation = PROVIDER_PRESENTATION[provider];
  const isLoading = status === 'loading';
  const isBlocked = isOAuthProviderButtonActivationBlocked(status);
  const visibleLabel = isLoading
    ? presentation.loadingLabel
    : status === 'error'
      ? presentation.retryLabel
      : presentation.idleLabel;
  const resolvedErrorMessage =
    errorMessage ?? `${presentation.name} 인증을 시작하지 못했습니다. 다시 시도해 주세요.`;

  const handleActivate = () => {
    if (isOAuthProviderButtonActivationBlocked(status)) {
      return;
    }

    onActivate(provider);
  };

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={isBlocked}
        aria-busy={isLoading}
        aria-describedby={status === 'error' ? errorId : undefined}
        data-provider={provider}
        data-intent={intent}
        data-status={status}
        onClick={handleActivate}
        className={`focus-visible:outline-primary-600 flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-transparent px-5 py-3 text-[15px] font-semibold transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${presentation.className}`}
      >
        <Image
          src={presentation.icon}
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          className="size-6 shrink-0"
        />
        <span>{visibleLabel}</span>
        {isLoading ? (
          <span
            aria-hidden="true"
            className="border-t-primary-600 size-4 animate-spin rounded-full border-2 border-neutral-300 motion-reduce:animate-none"
          />
        ) : null}
      </button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isLoading ? `${presentation.name} 인증 화면을 준비하고 있습니다.` : ''}
      </span>
      {status === 'error' ? (
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="text-danger-700 mt-2 text-[13px] leading-5"
        >
          {resolvedErrorMessage}
        </p>
      ) : null}
    </div>
  );
};

export default OAuthProviderButton;
