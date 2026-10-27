'use client';
// /craft 타이틀 — 로그인 세션의 사용자 이름(클라이언트 전용 auth 스토어)

import { useAuthStore } from '@/store/authStore';

const CraftPageHeader = () => {
  const auth = useAuthStore((state) => state.auth);
  const isChecking = auth.status === 'unknown' || auth.status === 'loading';
  const session = auth.status === 'authenticated' || auth.status === 'error' ? auth.session : null;
  const userName = session?.name ?? '게스트';

  return (
    <div>
      <h1 className="font-swiss text-ink text-[42px] leading-[1.1] font-medium tracking-[-0.03em]">
        {isChecking ? (
          <span className="bg-fog inline-block h-[84px] w-56 animate-pulse rounded-lg align-middle motion-reduce:animate-none" />
        ) : (
          <>
            <span className="block">
              <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--color-decor-yellow)_45%,white)_62%)] font-bold">
                {userName}
              </span>
              님의
            </span>
            <span className="mt-[10px] block">데스크테리어</span>
          </>
        )}
      </h1>
    </div>
  );
};

export default CraftPageHeader;
