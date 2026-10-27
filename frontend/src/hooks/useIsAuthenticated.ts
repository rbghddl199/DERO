'use client';
// 로그인 여부만 boolean으로 뽑아준다 — 좋아요·북마크의 "선택됨" 표시를 비회원에게는 항상 꺼두는 데 쓴다.
// localStorage 좋아요/북마크 스토어는 로그인 여부와 무관하게 유지되므로(브라우저 단위 저장), 로그인해서
// 눌렀다가 로그아웃해도 값 자체는 남아 있다 — 화면에 보여줄지는 이 훅으로 따로 게이팅한다.

import { useAuthStore } from '@/store/authStore';

export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.auth.status === 'authenticated');
}
