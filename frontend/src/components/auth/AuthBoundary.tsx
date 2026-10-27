// 인증 확인·비로그인·인증 완료·오류 상태의 표현만 담당하는 경계를 제공한다.

'use client';

import type { ReactNode } from 'react';

import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import type { AuthBoundaryStatus } from '@/types/auth-ui';

export type AuthBoundaryProps = {
  status: AuthBoundaryStatus;
  children: ReactNode;
  checkingLabel?: string;
  checkingDescription?: string;
  anonymousTitle?: string;
  anonymousDescription?: string;
  anonymousAction?: ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

const AuthBoundary = ({
  status,
  children,
  checkingLabel = '로그인 상태 확인 중',
  checkingDescription = '현재 인증 상태를 확인하고 있습니다.',
  anonymousTitle = '로그인이 필요합니다',
  anonymousDescription = '이 기능을 사용하려면 먼저 로그인해 주세요.',
  anonymousAction,
  errorTitle = '인증 상태 확인 실패',
  errorDescription = '로그인 상태를 확인하지 못했습니다.',
  retryLabel = '다시 확인',
  onRetry,
}: AuthBoundaryProps) => {
  if (status === 'checking') {
    return <LoadingState label={checkingLabel} description={checkingDescription} />;
  }

  if (status === 'anonymous') {
    return (
      <div className="w-full max-w-xl" data-auth-status={status}>
        <InlineNotice variant="warning" title={anonymousTitle} message={anonymousDescription} />
        {anonymousAction ? <div className="mt-5 flex justify-center">{anonymousAction}</div> : null}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-xl" data-auth-status={status}>
        <ErrorState
          title={errorTitle}
          description={errorDescription}
          retryLabel={retryLabel}
          onRetry={onRetry}
        />
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthBoundary;
