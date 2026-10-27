// 커뮤니티 라우트 — 사람들이 올린 데스크테리어 글을 구경하는 목록 페이지
import type { Metadata } from 'next';
import CommunityGallery from '@/components/community/CommunityGallery';
import ScrollProgress from '@/components/common/ScrollProgress';

export const metadata: Metadata = {
  title: '커뮤니티 — 데스크테리어 시뮬레이터',
  description: '사람들이 올린 데스크테리어 글을 구경하는 커뮤니티',
};

type Props = {
  /** '좋아요 목록 보기' 토스트 액션이 붙이는 숨은 필터 — 화면에 노출된 탭은 없다 */
  searchParams: Promise<{ view?: string; tag?: string }>;
};

const CommunityPage = async ({ searchParams }: Props) => {
  const { view, tag } = await searchParams;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        {/* key — 보기(view)가 바뀌면 통째로 리마운트해 내부 상태를 초기화한다(연출 목적 아님) */}
        <CommunityGallery
          key={`${view ?? 'all'}:${tag ?? 'all'}`}
          initialViewMode={view ?? null}
          initialTag={tag ?? null}
        />
      </div>
    </div>
  );
};

export default CommunityPage;
