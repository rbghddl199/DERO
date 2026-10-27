// 제품 라우트 — 실측 규격으로 검증된 제품 카탈로그를 둘러보는 페이지. tag 쿼리는 서버에서 읽어
// props로 내려준다 — useSearchParams()는 Suspense 경계가 필요하고, 이 프로젝트의 dev 환경에서
// 그 조합이 하이드레이션을 깨뜨리는 것으로 확인돼(클릭이 전부 씹힘, react 내부 키 자체가 안 붙음) 피한다.
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ScrollProgress from '@/components/common/ScrollProgress';
import { isMockApi } from '@/constants/api';
import { libraryItems } from '@/three/scene/product';

export const metadata: Metadata = {
  title: '제품 — 데스크테리어 시뮬레이터',
  description: '실측 규격으로 검증된 데스크테리어 제품을 살펴보세요',
};

type Props = {
  searchParams: Promise<{ tag?: string; category?: string; view?: string }>;
};

const ProductPage = async ({ searchParams }: Props) => {
  const { tag, category, view } = await searchParams;
  const viewMode = view === 'liked' ? 'liked' : 'all';
  // real 모드 목록은 ProductGrid가 클라이언트에서 카테고리별 20개씩 커서 페이징한다(useCatalogPage,
  // 2026-08-05 — 옛 전량 프리페치 loadRealLibraryProducts/prefetchCatalog는 삭제). mock만 서버에서
  // 정적 전량을 내려준다.
  const products = isMockApi() ? libraryItems() : [];

  return (
    <div className="min-h-full bg-white">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        {/* key — 태그/카테고리/보기가 바뀌면 통째로 리마운트해 그리드 내부 상태(검색·정렬)를
            초기화한다(연출 목적 아님) */}
        <ProductGrid
          key={`${tag ?? 'all'}-${category ?? 'all'}-${viewMode}`}
          initialTag={tag ?? null}
          initialCategory={category ?? null}
          initialViewMode={viewMode}
          products={products}
        />
      </div>
    </div>
  );
};

export default ProductPage;
