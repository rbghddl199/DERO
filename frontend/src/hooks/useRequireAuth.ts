'use client';
// 로그인이 필요한 동작 앞에 세우는 공용 가드 — 좋아요·북마크·댓글 작성/삭제가 전부 이걸 통과한다.
// 반환된 함수가 false면 호출부는 그 자리에서 return해야 한다(이미 로그인 페이지로 이동을 시작했다).
//
// 'authenticated'가 아닌 모든 상태를 막는다(anonymous·error는 물론 unknown·loading도).
// unknown/loading은 AuthBootstrap이 마운트 직후 해소하는 아주 짧은 구간이라, 그 사이를 통과시키면
// "비로그인인데 눌렸다"는 더 나쁜 결과가 나온다 — 막고 로그인 페이지로 보내는 쪽이 안전하다.
//
// 예전엔 안내 모달(LoginPromptModal)을 띄우고 그 자리에 머물렀는데, 로그인이 필요한 모든 경우를
// 로그인 페이지로 바로 이동시켜달라는 요청으로 되돌렸다(2026-08-03 사용자 확인) — /login?returnTo=
// <지금 위치>로 보내 로그인 후 같은 화면으로 돌아오게 하는 동작은 그대로 유지한다.

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export function useRequireAuth(): () => boolean {
  const status = useAuthStore((s) => s.auth.status);
  const router = useRouter();

  return () => {
    if (status === 'authenticated') return true;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  };
}
