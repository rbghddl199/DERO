// 데스크피드 라우트 — 사용자가 올린 실제 책상 사진을 갤러리로 둘러보는 목록 페이지.
//
// 이 페이지는 metadata와 껍데기만 담당한다. 목록 조회는 DeskFeedGalleryLoader가 브라우저에서
// 한다 — 정렬 전환·태그 필터·무한 스크롤 커서가 전부 상태라 서버 컴포넌트로는 성립하지 않는다
// (app/collection/page.tsx와 같은 형태).
//
// tag 쿼리는 서버에서 읽어 props로 내려준다 — useSearchParams()는 이 dev 환경에서 하이드레이션을
// 깨뜨려 쓰지 않는다. 상세의 태그 링크(`/desk-feed?tag=`)가 이 값을 채운다.
import type { Metadata } from 'next';
import ScrollProgress from '@/components/common/ScrollProgress';
import DeskFeedGalleryLoader from '@/components/desk-feed/DeskFeedGalleryLoader';

export const metadata: Metadata = {
  title: '데스크피드 — 데스크테리어 시뮬레이터',
  description: '사람들이 올린 실제 책상 사진을 둘러보는 데스크피드',
};

type Props = {
  searchParams: Promise<{ tag?: string }>;
};

const DeskFeedPage = async ({ searchParams }: Props) => {
  const { tag } = await searchParams;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      {/* 모바일은 여백을 줄여 사진에 폭을 준다 — 카드 갤러리라 좌우 여백 손해가 크다. */}
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-24 sm:px-6 sm:pt-12 lg:px-[48px]">
        {/* key — 쿼리 태그가 바뀌면 통째로 리마운트해 정렬·칩 등 내부 상태를 초기화한다. */}
        <DeskFeedGalleryLoader key={tag ?? 'all'} initialTag={tag ?? null} />
      </div>
    </div>
  );
};

export default DeskFeedPage;
