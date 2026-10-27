'use client';
// 홈 히어로 '시작하기'(단일 CTA — 2026-08-02 커뮤니티 둘러보기 버튼 제거하고 문구 통일) —
// 비로그인이면 로그인 화면(returnTo=/craft)으로 먼저 보내고,
// 로그인 상태면 내 데스크테리어 목록(/craft)으로 곧장 들어간다(2026-07-31 사용자 확인 — 마법사
// 1단계가 아니라 목록 화면으로 목적지 변경). 문구는 로그인 여부와 무관하게 '시작하기' 그대로 —
// 목적지·게이트만 갈린다(라벨까지 바뀌는 클로징 CTA는 HomeCtaLink.tsx, 목적지는 이제 동일: /craft).

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

/** 로그인 후 이어질 목적지 — 내 데스크테리어 목록 */
const DESTINATION = '/craft';

const HomeWorkspaceLink = () => {
  const auth = useAuthStore((state) => state.auth);
  const isAuthenticated = auth.status === 'authenticated';
  const href = isAuthenticated ? DESTINATION : `/login?returnTo=${encodeURIComponent(DESTINATION)}`;

  return (
    <Link
      href={href}
      className="bg-ink rounded-xl px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-neutral-800 active:bg-black"
    >
      시작하기
    </Link>
  );
};

export default HomeWorkspaceLink;
