// 로그인이 필수인 라우트의 진입 관문 — 비로그인이면 /login?returnTo=<지금 경로>로 보낸다(D14).

'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import AuthBoundary from '@/components/auth/AuthBoundary';
import { useAuthStore } from '@/store/authStore';
import type { AuthState } from '@/types/auth';
import type { AuthBoundaryStatus } from '@/types/auth-ui';

/** canonical Auth 상태 → 경계 표현 상태. MypageShell.tsx와 같은 매핑이다.
 *  - unknown·loading은 'checking'이다. 이 구간을 'anonymous'로 뭉개면 이미 로그인한 사용자에게
 *    비로그인 화면이 한 번 깜빡이고 로그인 페이지로 튕긴다(AuthBootstrap이 세션을 확인하기 전이라
 *    아직 아무것도 모르는 상태일 뿐이다).
 *  - error인데 세션이 남아 있으면(session-preserving forbidden, authStore.handleFailure 참고)
 *    로그인 자체는 유효하므로 통과시킨다. */
export function resolveAuthGateStatus(auth: AuthState): AuthBoundaryStatus {
  if (auth.status === 'unknown' || auth.status === 'loading') {
    return 'checking';
  }
  if (auth.status === 'anonymous') {
    return 'anonymous';
  }
  if (auth.status === 'error' && auth.session === null) {
    return 'error';
  }
  return 'authenticated';
}

export type AuthGateProps = {
  children: ReactNode;
  checkingLabel?: string;
  checkingDescription?: string;
  anonymousTitle?: string;
  anonymousDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
};

const AuthGate = ({
  children,
  checkingLabel = '로그인 상태 확인 중',
  checkingDescription = '현재 인증 상태를 확인하고 있습니다.',
  anonymousTitle = '로그인이 필요합니다',
  anonymousDescription = '로그인 화면으로 이동합니다.',
  errorTitle = '인증 상태 확인 실패',
  errorDescription = '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
}: AuthGateProps) => {
  const auth = useAuthStore((state) => state.auth);
  const router = useRouter();
  const status = resolveAuthGateStatus(auth);

  useEffect(() => {
    if (status !== 'anonymous') {
      return;
    }

    // useSearchParams()를 쓰지 않는다 — Suspense 경계가 필요하고 이 프로젝트의 dev 환경에서
    // 하이드레이션을 깨뜨린다(product/page.tsx·MypageShell.tsx와 같은 이유). useRequireAuth와
    // 동일하게 window.location에서 직접 읽는다.
    const returnTo = `${window.location.pathname}${window.location.search}`;
    // push가 아니라 replace다 — 막힌 경로를 히스토리에 남기면 로그인 화면에서 뒤로가기를 눌렀을 때
    // 다시 이 관문에 걸려 로그인 화면으로 튕기는 왕복이 생긴다.
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [status, router]);

  // 통과했으면 래퍼 DOM을 하나도 끼우지 않는다 — /simulator의 `#app`이 `height: 100%`로 부모
  // 높이에 직접 기대고 있어서(three/bootstrap/style.css) 중간에 auto 높이 div가 하나 끼면
  // 3D 캔버스 레이아웃이 무너진다.
  if (status === 'authenticated') {
    return <>{children}</>;
  }

  // data-auth-gate — 관문이 아직 안 열렸다는 유일한 DOM 신호. 통과하면 이 노드 자체가 사라진다.
  return (
    <div data-auth-gate={status} className="mx-auto w-full max-w-xl px-6 py-12">
      <AuthBoundary
        status={status}
        checkingLabel={checkingLabel}
        checkingDescription={checkingDescription}
        anonymousTitle={anonymousTitle}
        anonymousDescription={anonymousDescription}
        errorTitle={errorTitle}
        errorDescription={errorDescription}
      >
        {null}
      </AuthBoundary>
    </div>
  );
};

export default AuthGate;
