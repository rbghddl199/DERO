// 마이페이지 Desktop shell과 내 정보 조회·수정 UI를 제공하는 라우트다.

import type { Metadata } from 'next';

import MypageShell from '@/components/mypage/MypageShell';

export const metadata: Metadata = {
  title: '마이페이지 — 데스크테리어 시뮬레이터',
  description: '내 프로필 정보를 확인하고 수정합니다',
};

type Props = {
  searchParams: Promise<{ menu?: string }>;
};

// menu 쿼리는 서버에서 읽어 props로 내려준다 — 좋아요·북마크 토스트의 '목록 보기'가
// /mypage?menu=wishlist·bookmark로 바로 들어온다(community/page.tsx와 같은 패턴).
const MypagePage = async ({ searchParams }: Props) => {
  const { menu } = await searchParams;

  // App Router는 같은 page 컴포넌트에서 searchParams만 바뀌면 클라이언트 상태를 보존한다. 메뉴
  // 쿼리를 key로 주어 상세 → 뒤로가기 때 `bookmark` props와 예전 `profile` state가 섞이지 않게 한다.
  return <MypageShell key={menu ?? 'profile'} initialMenuQuery={menu ?? null} />;
};

export default MypagePage;
