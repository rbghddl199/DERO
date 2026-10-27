// 고정 /auth/callback에서 bootstrap 결과만 표시하고 safe returnTo를 한 번 소비한다.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import OAuthCallbackPanel from '@/components/auth/OAuthCallbackPanel';
import { authRuntime, type CallbackCompletion } from '@/components/auth/authRuntime';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { OAuthCallbackStatus } from '@/types/auth-ui';

interface CallbackView {
  status: OAuthCallbackStatus;
  title?: string;
  description?: string;
}

function callbackView(completion: CallbackCompletion): CallbackView {
  if (completion.kind === 'success') {
    return { status: 'success' };
  }
  if (completion.failure.code === AUTH_ERROR_CODES.sessionRevoked) {
    return {
      status: 'failure',
      title: '세션이 종료되었습니다',
      description: completion.failure.message,
    };
  }
  if (completion.failure.code === AUTH_ERROR_CODES.forbidden) {
    return {
      status: 'failure',
      title: '접근 권한 없음',
      description: completion.failure.message,
    };
  }

  return {
    status: 'failure',
    description: completion.failure.message,
  };
}

const AuthCallbackRoute = () => {
  const router = useRouter();
  const [view, setView] = useState<CallbackView>({ status: 'processing' });

  useEffect(() => {
    let active = true;
    let navigationTimer: number | undefined;
    const processingTimer = window.setTimeout(() => {
      void authRuntime.completeCallback().then((completion) => {
        if (!active) {
          return;
        }

        setView(callbackView(completion));
        if (completion.kind === 'success') {
          navigationTimer = window.setTimeout(() => {
            router.replace(completion.returnTo);
          }, 150);
        }
      });
    }, 1000);

    return () => {
      active = false;
      window.clearTimeout(processingTimer);
      if (navigationTimer !== undefined) {
        window.clearTimeout(navigationTimer);
      }
    };
  }, [router]);

  return (
    <OAuthCallbackPanel
      status={view.status}
      title={view.title}
      description={view.description}
      onRetry={
        view.status === 'failure'
          ? () => {
              router.replace('/login');
            }
          : undefined
      }
    />
  );
};

export default AuthCallbackRoute;
