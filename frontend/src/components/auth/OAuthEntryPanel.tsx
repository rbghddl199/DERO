// 로그인·회원가입 intent에 맞춰 Google·Kakao OAuth 진입 선택지를 표시한다.

'use client';

import Image from 'next/image';
import { useId } from 'react';

import OAuthProviderButton from '@/components/auth/OAuthProviderButton';
import DeroLogoBlack from '@/assets/dero_logo_black.webp';
import type { OAuthIntent, OAuthProvider, OAuthProviderButtonStatus } from '@/types/auth-ui';

export type OAuthEntryPanelProps = {
  intent: OAuthIntent;
  title?: string;
  description?: string;
  providerStatuses?: Partial<Record<OAuthProvider, OAuthProviderButtonStatus>>;
  providerErrorMessages?: Partial<Record<OAuthProvider, string>>;
  onProviderSelect: (provider: OAuthProvider) => void;
};

const PROVIDERS: OAuthProvider[] = ['google', 'kakao'];

const OAuthEntryPanel = ({
  intent,
  title,
  description,
  providerStatuses,
  providerErrorMessages,
  onProviderSelect,
}: OAuthEntryPanelProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const resolvedTitle = title ?? (intent === 'login' ? '로그인' : '회원가입');
  const resolvedDescription =
    description ??
    (intent === 'login'
      ? '소셜 계정으로 로그인해 데스크 작업을 이어가세요.'
      : '소셜 계정으로 간편하게 시작하세요.');
  const hasLoadingProvider = PROVIDERS.some(
    (provider) => providerStatuses?.[provider] === 'loading',
  );

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={hasLoadingProvider}
      data-intent={intent}
      className="w-full max-w-[416px]"
    >
      <div className="text-center">
        <Image
          src={DeroLogoBlack}
          alt="DERO"
          width={48}
          height={48}
          priority
          className="mx-auto h-12 w-12"
        />
        <h1 id={titleId} className="mt-4 text-[32px] leading-[1.25] font-semibold text-neutral-900">
          {resolvedTitle}
        </h1>
        <p id={descriptionId} className="mt-3 text-[15px] leading-6 text-neutral-600">
          {resolvedDescription}
        </p>
      </div>
      <fieldset className="mt-10 flex flex-col gap-2">
        <legend className="sr-only">소셜 로그인 제공자</legend>
        {PROVIDERS.map((provider) => {
          const providerStatus = providerStatuses?.[provider] ?? 'idle';
          const resolvedStatus =
            hasLoadingProvider && providerStatus !== 'loading' ? 'disabled' : providerStatus;

          return (
            <OAuthProviderButton
              key={provider}
              provider={provider}
              intent={intent}
              status={resolvedStatus}
              errorMessage={providerErrorMessages?.[provider]}
              onActivate={onProviderSelect}
            />
          );
        })}
      </fieldset>
      {intent === 'login' ? (
        <p className="mt-6 text-center text-[13px] leading-5 text-neutral-500">
          아직 계정이 없으신가요?
          <br />
          소셜 로그인 시 자동으로 회원가입이 진행됩니다.
        </p>
      ) : null}
    </section>
  );
};

export default OAuthEntryPanel;
