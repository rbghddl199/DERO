// 남의 프로필 라우트 — 프로필·공개 배치·팔로우가 전부 클라이언트에서 실제 API로 그려진다.
// 서버에서 미리 받지 않는 이유: 팔로우 여부(`following`)가 조회자에 따라 갈리는 값이라 액세스
// 토큰이 필요한데, 그 토큰은 메모리 holder에만 있고 서버 컴포넌트가 못 본다(ADR-0005).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import UserProfileScreen from '@/components/user/UserProfileScreen';

type Props = {
  params: Promise<{ userId: string }>;
};

export const metadata: Metadata = {
  title: '프로필 — 데스크테리어 시뮬레이터',
  description: '다른 사용자의 프로필과 공개한 데스크테리어를 봅니다',
};

const UserProfilePage = async ({ params }: Props) => {
  const { userId } = await params;
  const numericId = Number(userId);
  // 숫자가 아닌 경로는 API를 치기 전에 끊는다 — /users/me는 이 라우트가 아니라 /mypage다.
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  return (
    <div className="bg-paper min-h-full">
      <div className="mx-auto max-w-[1200px] px-[clamp(24px,4.6875vw,48px)] pt-12 pb-24">
        <UserProfileScreen userId={numericId} />
      </div>
    </div>
  );
};

export default UserProfilePage;
