// OAuth callback 처리 결과를 공통 Feedback 컴포넌트로 상태별 표시한다.

'use client';

import type { ReactNode } from 'react';

import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import type { OAuthCallbackStatus } from '@/types/auth-ui';

export type OAuthCallbackPanelProps = {
  status: OAuthCallbackStatus;
  title?: string;
  description?: string;
  action?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
};

const getDefaultCopy = (
  status: OAuthCallbackStatus,
): {
  title: string;
  description: string;
} => {
  switch (status) {
    case 'processing':
      return {
        title: '인증 처리 중',
        description: '소셜 계정의 인증 결과를 확인하고 있습니다.',
      };
    case 'success':
      return {
        title: '인증 완료',
        description: '소셜 계정 인증이 완료되었습니다.',
      };
    case 'failure':
      return {
        title: '인증 실패',
        description: '소셜 계정 인증을 완료하지 못했습니다.',
      };
  }
};

const OAuthCallbackPanel = ({
  status,
  title,
  description,
  action,
  retryLabel = '다시 인증',
  onRetry,
}: OAuthCallbackPanelProps) => {
  const defaultCopy = getDefaultCopy(status);
  const resolvedTitle = title ?? defaultCopy.title;
  const resolvedDescription = description ?? defaultCopy.description;

  return (
    <div data-status={status} className="w-full max-w-xl">
      {status === 'processing' ? (
        <LoadingState label={resolvedTitle} description={resolvedDescription} />
      ) : null}
      {status === 'success' ? (
        <InlineNotice variant="success" title={resolvedTitle} message={resolvedDescription} />
      ) : null}
      {status === 'failure' ? (
        <ErrorState
          title={resolvedTitle}
          description={resolvedDescription}
          retryLabel={retryLabel}
          onRetry={onRetry}
        />
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
};

export default OAuthCallbackPanel;
