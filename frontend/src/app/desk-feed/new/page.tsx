// 데스크피드 사진 올리기 라우트 — 실제 책상 사진과 제목·소개·태그를 받아 올린다.
// 갤러리는 비로그인도 열리므로 라우트 게이트는 없고, 진입 버튼과 제출에서 requireAuth로 막는다
// (커뮤니티 글쓰기와 같은 관례).
import type { Metadata } from 'next';
import ScrollProgress from '@/components/common/ScrollProgress';
import DeskFeedUploadForm from '@/components/desk-feed/DeskFeedUploadForm';

export const metadata: Metadata = {
  title: '사진 올리기 — 데스크테리어 시뮬레이터',
  description: '내 실제 책상 사진을 데스크피드에 올리세요',
};

const DeskFeedNewPage = () => {
  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[760px] px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <DeskFeedUploadForm />
      </div>
    </div>
  );
};

export default DeskFeedNewPage;
