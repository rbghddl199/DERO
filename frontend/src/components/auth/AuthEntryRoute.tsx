// /login과 /signup이 같은 OAuthEntryPanel과 안전한 returnTo 조립을 공유한다.

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import LoadingState from '@/components/common/LoadingState';
import OAuthEntryPanel from '@/components/auth/OAuthEntryPanel';
import { authRuntime } from '@/components/auth/authRuntime';
import { useAuthStore } from '@/store/authStore';
import type { AuthProvider } from '@/types/auth';
import type { OAuthIntent, OAuthProviderButtonStatus } from '@/types/auth-ui';
import { sanitizeReturnTo } from '@/utils/auth/returnTo';

interface AuthEntryRouteProps {
  intent: OAuthIntent;
}

const AuthEntryRoute = ({ intent }: AuthEntryRouteProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuthStore((state) => state.auth);
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(null);
  const [providerFailure, setProviderFailure] = useState<{
    provider: AuthProvider;
    message: string;
  } | null>(null);
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));

  useEffect(() => {
    if (auth.status === 'authenticated') {
      router.replace(returnTo);
    }
  }, [auth.status, returnTo, router]);

  const handleProviderSelect = async (provider: AuthProvider): Promise<void> => {
    setActiveProvider(provider);
    setProviderFailure(null);
    authRuntime.saveReturnTo(returnTo);

    const result = await authRuntime.startAuthorization(provider);
    if (result.kind === 'failure') {
      setProviderFailure({ provider, message: result.failure.message });
      setActiveProvider(null);
      return;
    }

    router.replace('/auth/callback');
  };

  if (auth.status === 'unknown' || auth.status === 'loading' || auth.status === 'authenticated') {
    return (
      <LoadingState label="로그인 상태 확인 중" description="현재 인증 상태를 확인하고 있습니다." />
    );
  }

  const providerStatuses: Partial<Record<AuthProvider, OAuthProviderButtonStatus>> = {};
  if (activeProvider !== null) {
    providerStatuses[activeProvider] = 'loading';
  } else if (providerFailure !== null) {
    providerStatuses[providerFailure.provider] = 'error';
  }

  return (
    <OAuthEntryPanel
      intent={intent}
      providerStatuses={providerStatuses}
      providerErrorMessages={
        providerFailure === null
          ? undefined
          : { [providerFailure.provider]: providerFailure.message }
      }
      onProviderSelect={(provider) => {
        void handleProviderSelect(provider);
      }}
    />
  );
};

export default AuthEntryRoute;
