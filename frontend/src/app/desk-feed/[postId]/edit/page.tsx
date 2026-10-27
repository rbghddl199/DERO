// 데스크피드 사진 수정 라우트 — 캡션·태그·사진 순서·배치 첨부를 고친다(ADR-0033 결정 4).
// 조회·저장 모두 클라이언트(DeskFeedEditForm)가 한다: 본인 글 판정과 본인 PUBLIC 배치 목록이
// 로그인 세션에 딸린 값이다. 라우트 게이트는 없고 폼이 requireAuth로 막는다(작성 페이지와 같은 관례).
import type { Metadata } from 'next';
import ScrollProgress from '@/components/common/ScrollProgress';
import DeskFeedEditForm from '@/components/desk-feed/DeskFeedEditForm';

export const metadata: Metadata = {
  title: '사진 수정 — 데스크테리어 시뮬레이터',
  description: '데스크피드에 올린 내 책상 사진을 수정합니다',
};

type Props = {
  params: Promise<{ postId: string }>;
};

const DeskFeedEditPage = async ({ params }: Props) => {
  const { postId } = await params;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[760px] px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <DeskFeedEditForm deskFeedId={Number(postId)} />
      </div>
    </div>
  );
};

export default DeskFeedEditPage;
