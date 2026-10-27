// 관리자 콘솔 셸 — role이 admin인 세션만 통과시키는 렌더 게이트와 좌측 내비를 제공한다.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import AuthBoundary from '@/components/auth/AuthBoundary';
import InlineNotice from '@/components/common/InlineNotice';
import { ADMIN_NAV_ITEMS } from '@/constants/admin/navigation';
import { useAuthStore } from '@/store/authStore';
import type { AuthBoundaryStatus } from '@/types/auth-ui';

const LOGIN_HREF = `/login?returnTo=${encodeURIComponent('/admin')}`;

const AdminNav = ({ pathname }: { pathname: string }) => (
  <nav aria-label="관리자 메뉴">
    <ul className="space-y-1">
      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`block rounded-[10px] px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                isActive ? 'bg-primary-100 text-primary-800' : 'text-ink hover:bg-fog/60'
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  </nav>
);

// 403은 세션을 끊지 않는다 — authStore.handleFailure도 forbidden에서 세션을 보존한다.
const AdminForbidden = () => (
  <div className="w-full max-w-xl" data-admin-status="forbidden">
    <InlineNotice
      variant="error"
      title="관리자 전용 화면입니다"
      message="이 계정에는 관리자 권한이 없습니다. 권한이 필요하면 운영 담당자에게 문의해 주세요."
    />
    <div className="mt-5 flex justify-center">
      <Link
        href="/"
        className="border-ash/30 text-ink rounded-[10px] border px-5 py-3 text-sm font-semibold"
      >
        홈으로 돌아가기
      </Link>
    </div>
  </div>
);

type Props = {
  children: ReactNode;
};

// useRequireAuth 같은 훅이 아니라 렌더 게이트다 — 훅은 auth 상태가 늦게 바뀌면 stale closure로
// 이미 지나간 판정을 그대로 쓴다(MypageShell과 같이 매 렌더 auth.status를 다시 접는다).
const AdminShell = ({ children }: Props) => {
  const auth = useAuthStore((state) => state.auth);
  const pathname = usePathname();

  const session = auth.status === 'authenticated' || auth.status === 'error' ? auth.session : null;

  let boundaryStatus: AuthBoundaryStatus = 'authenticated';
  if (auth.status === 'unknown' || auth.status === 'loading') {
    // unknown은 아직 확인 전이다 — 여기서 통과시키면 관리자 화면이 잠깐 노출된다.
    boundaryStatus = 'checking';
  } else if (auth.status === 'anonymous') {
    boundaryStatus = 'anonymous';
  } else if (auth.status === 'error' && session === null) {
    boundaryStatus = 'error';
  }

  return (
    <div className="bg-paper min-h-full">
      <div className="font-swiss mx-auto max-w-[1200px] px-6 pt-12 pb-24 tracking-[-0.03em]">
        <AuthBoundary
          status={boundaryStatus}
          checkingLabel="관리자 권한 확인 중"
          checkingDescription="로그인 상태와 권한을 확인하고 있습니다."
          anonymousDescription="관리자 콘솔은 로그인 후 이용할 수 있습니다."
          anonymousAction={
            <Link
              href={LOGIN_HREF}
              className="bg-ink hover:bg-ink/85 rounded-[10px] px-5 py-3 text-sm font-semibold text-white transition-colors"
            >
              로그인 화면으로
            </Link>
          }
          errorTitle="권한 확인 실패"
          errorDescription="로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
        >
          {session?.role === 'admin' ? (
            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-8">
              <aside className="border-ash/20 self-start rounded-2xl border bg-white p-4">
                <p className="text-ink px-3 pt-2 pb-5 text-xl font-bold">관리자 콘솔</p>
                <AdminNav pathname={pathname} />
              </aside>

              <section className="border-ash/20 min-w-0 rounded-2xl border bg-white p-10">
                {children}
              </section>
            </div>
          ) : (
            <AdminForbidden />
          )}
        </AuthBoundary>
      </div>
    </div>
  );
};

export default AdminShell;
