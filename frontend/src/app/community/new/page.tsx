// 커뮤니티 글 작성 라우트 — 제목 + 마크다운 본문을 자유롭게 쓰고 상품을 검색해 삽입한다
import type { Metadata } from 'next';
import CommunityEditor from '@/components/community/CommunityEditor';
import ScrollProgress from '@/components/common/ScrollProgress';

export const metadata: Metadata = {
  title: '작성하기 — 데스크테리어 시뮬레이터',
  description: '내 데스크테리어를 소개하는 글을 작성하세요',
};

const CommunityNewPage = () => {
  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        <CommunityEditor />
      </div>
    </div>
  );
};

export default CommunityNewPage;
