// 컬렉션 라우트 — 다른 사람이 올린 데스크테리어(공개 배치)를 갤러리로 둘러보는 목록 페이지.
//
// 이 페이지는 metadata와 껍데기만 담당한다. 목록 조회는 CollectionGalleryLoader가 브라우저에서 한다 —
// 정렬 전환과 무한 스크롤이 둘 다 상태이고 커서를 들고 다음 페이지를 이어 붙여야 해서 서버 컴포넌트로는
// 성립하지 않는다(app/craft/page.tsx가 같은 자리에서 같은 형태를 쓴다).
//
// tag 쿼리는 서버에서 읽어 props로 내려준다 — useSearchParams()는 이 dev 환경에서 하이드레이션을
// 깨뜨려 쓰지 않는다(app/product/page.tsx와 같은 이유). 상세 페이지의 태그 링크(`/collection?tag=`)가
// 이 값을 채운다.
import type { Metadata } from 'next';
import ScrollProgress from '@/components/common/ScrollProgress';
import CollectionGalleryLoader from '@/components/collection/CollectionGalleryLoader';

export const metadata: Metadata = {
  title: '컬렉션 — 데스크테리어 시뮬레이터',
  description: '사람들이 올린 데스크테리어를 갤러리로 둘러보고 가져올 수 있는 컬렉션',
};

type Props = {
  searchParams: Promise<{ tag?: string }>;
};

const CollectionPage = async ({ searchParams }: Props) => {
  const { tag } = await searchParams;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        {/* key — 쿼리로 들어온 태그가 바뀌면 통째로 리마운트해 검색·정렬 등 내부 상태를 초기화한다
            (ProductGrid와 같은 관례). */}
        <CollectionGalleryLoader key={tag ?? 'all'} initialTag={tag ?? null} />
      </div>
    </div>
  );
};

export default CollectionPage;
