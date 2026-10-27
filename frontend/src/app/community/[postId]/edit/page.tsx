// 커뮤니티 글 수정 라우트 — 본인 글만 고칠 수 있다(폼이 authorId로 한 번, 서버가 403으로 다시 막는다)
import type { Metadata } from 'next';
import CommunityPostEditForm from '@/components/community/CommunityPostEditForm';
import ScrollProgress from '@/components/common/ScrollProgress';

export const metadata: Metadata = {
  title: '글 수정 — 데스크테리어 시뮬레이터',
  description: '내가 올린 커뮤니티 글을 수정합니다',
};

type Props = {
  params: Promise<{ postId: string }>;
};

const CommunityPostEditPage = async ({ params }: Props) => {
  const { postId } = await params;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        <CommunityPostEditForm postId={Number(postId)} />
      </div>
    </div>
  );
};

export default CommunityPostEditPage;
