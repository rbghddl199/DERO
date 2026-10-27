'use client';
// 랜딩 클로징 CTA — 로그인 여부에 따라 문구·목적지가 갈린다. 비로그인이면 로그인 화면으로 보내고
// (AuthEntryRoute가 읽는 returnTo에 최종 목적지를 실어, 로그인 성공 시 바로 그 화면으로 이어진다),
// 로그인 상태면 그 화면으로 곧장 보낸다. TopNavbar가 같은 canonical Auth 상태로 로그인/프로필을
// 가르는 것과 같은 패턴이다.
//
// React Bits SpecularButton을 적용했다가 디자인이 마음에 들지 않아 원래 <Link> 버튼으로 되돌렸다
// (2026-07-31 사용자 확인). SpecularButton.tsx·ogl 의존성도 함께 제거했다.

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

/** 로그인 후 이어질 목적지 — 내 데스크테리어 목록(/craft). 히어로의 '작업실 바로가기'(HomeWorkspaceLink)는
 *  같은 로그인 게이트를 쓰지만 목적지가 /craft/new(마법사 1단계)로 다르다 — 혼동하지 말 것. */
const DESTINATION = '/craft';

const HomeCtaLink = () => {
  const auth = useAuthStore((state) => state.auth);
  // unknown/loading(마운트 직후 아주 짧은 구간)도 비로그인과 같은 문구로 둔다 — TopNavbar처럼
  // 스켈레톤을 넣기엔 버튼 하나뿐이라 과하고, 인증되는 순간 바로 문구가 바뀌어 체감상 깜빡임이 없다.
  const isAuthenticated = auth.status === 'authenticated';

  if (isAuthenticated) {
    return (
      <Link
        href={DESTINATION}
        data-scroll-top="true"
        className="text-primary-50 mt-7 inline-flex items-center rounded-xl bg-neutral-900 px-6 py-3 text-[15px] font-medium transition-colors hover:bg-neutral-800"
      >
        데스크 꾸미러 가기
      </Link>
    );
  }

  return (
    <Link
      href={`/login?returnTo=${encodeURIComponent(DESTINATION)}`}
      data-scroll-top="true"
      className="text-primary-50 mt-7 inline-flex items-center rounded-xl bg-neutral-900 px-6 py-3 text-[15px] font-medium transition-colors hover:bg-neutral-800"
    >
      로그인하고 시작하기
    </Link>
  );
};

export default HomeCtaLink;
