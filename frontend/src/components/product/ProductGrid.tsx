'use client';
// 제품 카탈로그 그리드 — libraryItems()(책상 제외 소품·모니터·조명 등)를 카드로 나열.
// 전체 보기(/product)든 카테고리 보기(?category=X)든 항상 좌측 사이드바(ProductCategorySidebar)
// 레이아웃 하나다(2026-08-03 사용자 확인 — 아이콘 쇼케이스가 뜨던 전체 보기 전용 화면을 없애고
// 카테고리 화면으로 통일). '새로 등록된 제품' 캐러셀만 전체 보기에서만 보여준다(카테고리별로
// 뜨는 게 불필요하다는 피드백, 2026-08-03).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AutoCarousel from '@/components/common/AutoCarousel';
import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import SortDropdown from '@/components/common/SortDropdown';
import Toast from '@/components/common/Toast';
import { isMockApi } from '@/constants/api';
import { CATEGORY_LABEL } from '@/constants/productCategory';
import {
  categoryIdsOf,
  matchesCategoryFilter,
  PRODUCT_CATEGORY_CHANGE_EVENT,
  PRODUCT_CATEGORY_NAV_GROUPS,
  resolveCategoryKey,
} from '@/constants/productCategoryGroup';
import { useCatalogPage } from '@/hooks/useCatalogPage';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useProductLikesStore } from '@/store/productLikesStore';
import type { ProductSpec } from '@/three/scene/product';
import ProductCard from './ProductCard';
import ProductCategoryIcon from './ProductCategoryIcon';
import ProductCategorySidebar, {
  ProductCategoryChipRail,
  type ProductCategoryNavItem,
} from './ProductCategorySidebar';
import ProductPromoBanner from './ProductPromoBanner';
import { getDisplayPriceKrw, getProductContent } from './productContent';

const ALL_FILTER = '전체';
/** 캐러셀 풀 크기 — 한 번에 4개 보이고 2개씩 넘어가므로 보이는 수보다 넉넉해야 한다 */
const RECENT_PRODUCT_COUNT = 8;
const RECENT_CAROUSEL_STEP = 2;
/** 포커스 링 — ErrorState.tsx가 쓰는 조합을 그대로 재사용한다(레포 유일 선례) */
const FOCUS_RING_CLASS =
  'focus-visible:outline-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2';
/** mock 모드 무한 스크롤 한 묶음 — lg 4열 기준 5행. mock은 정적 전량이 이미 손에 있으므로 이건
 *  네트워크가 아니라 첫 렌더 DOM 노드 수를 끊는 장치다. real 모드는 서버 커서 페이지(20개)가 곧
 *  배치라 이 클라 배칭을 끈다(useCatalogPage, 2026-08-05). */
const PAGE_SIZE = 20;

type SortOrder = 'registered' | 'price-asc' | 'price-desc' | 'latest';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'registered', label: '등록순' },
  { value: 'price-asc', label: '가격 낮은순' },
  { value: 'price-desc', label: '가격 높은순' },
  { value: 'latest', label: '최신순' },
];

/** 카드 그리드 + 무한 스크롤 sentinel. 지금까지 펼친 개수를 이 컴포넌트가 소유하고, 목록이 통째로
 *  바뀌면(검색어·정렬) 부모가 key로 리마운트해 개수를 되감는다 — 리셋 이펙트를 두면 React Compiler
 *  린트가 "이펙트 안 동기 setState"로 막고, simulator/LibraryPanel의 GallerySection도 같은 이유로
 *  key 리마운트를 쓴다. **root를 주지 않는 건 의도적이다** — 그쪽은 자기 패널이 스크롤 컨테이너지만
 *  여기는 페이지 자체가 스크롤되므로 뷰포트(기본값)가 맞다. */
const ProductCardGrid = ({
  products,
  likedIds,
  onToggleLike,
  hasNext = false,
  isLoadingMore = false,
  onLoadMore,
}: {
  products: ProductSpec[];
  likedIds: ReadonlySet<string>;
  onToggleLike: (id: string) => void;
  /** 서버 페이징: 아직 더 받을 페이지가 있는가. onLoadMore와 세트다. */
  hasNext?: boolean;
  isLoadingMore?: boolean;
  /** 넘기면 서버 페이징 모드 — 클라 배칭을 끄고 센티널이 다음 **페이지 요청**을 부른다
   *  (simulator/LibraryPanel.tsx GallerySection과 같은 계약). 안 넘기면(mock) 예전 그대로
   *  이미 받은 배열을 PAGE_SIZE씩 잘라 보여준다. */
  onLoadMore?: () => void;
}) => {
  const serverPaged = onLoadMore !== undefined;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 서버 페이징 모드에선 서버 페이지(20개)가 곧 배치다 — 클라 배치가 겹치면 센티널이 페이지를
  // 다 소진하기 전에 멈춘다(LibraryPanel의 교훈).
  const visibleProducts = serverPaged ? products : products.slice(0, visibleCount);
  const hasMore = serverPaged ? hasNext : visibleCount < products.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (serverPaged) {
          onLoadMore();
          return;
        }
        setVisibleCount((count) => Math.min(products.length, count + PAGE_SIZE));
      },
      // 바닥에 닿기 전에 미리 채워 스크롤이 끊기지 않게 한다
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // visibleCount가 deps에 있어야 한다 — IntersectionObserver는 "경계를 넘는 순간"에만 콜백을
    // 부르므로, 한 묶음을 펼친 뒤에도 sentinel이 계속 보이는 상태면(카드가 적거나 rootMargin 안에
    // 들어와 있으면) 다시 부르지 않는다. 묶음마다 옵저버를 새로 걸어 화면이 찰 때까지 이어 펼친다.
  }, [hasMore, products.length, visibleCount, serverPaged, onLoadMore]);

  return (
    <>
      {/* 카드 사이 여백 — gap-3이 답답해 보여 넉넉하게 벌렸다(커뮤니티 그리드와 같은 톤).
        세로 간격을 가로보다 크게 두는 건 카드 아래 브랜드·이름·가격 세 줄이 붙어 있어서다. */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isLiked={likedIds.has(product.id)}
            onToggleLike={onToggleLike}
          />
        ))}
      </div>
      {/* 무한 스크롤 sentinel — 여기가 보이면 다음 묶음(mock: 슬라이스, real: 서버 페이지)을
        가져온다. mock은 즉시 슬라이스라 스피너가 깜빡임만 늘리므로 real 대기 중에만 돌린다. */}
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden="true" />}
      {isLoadingMore && (
        <div className="flex justify-center py-8" aria-hidden="true">
          <div className="border-ash/30 border-t-ink h-7 w-7 animate-spin rounded-full border-2" />
        </div>
      )}
    </>
  );
};

/** 비로그인일 때 likedIds 자리에 넣는 고정 참조 — 매 렌더 새 Set을 만들면 이 값을 쓰는 useMemo가
 *  전부 매번 다시 계산된다(리스트 배열도 새로 만들어져 얕은 비교가 항상 실패). */
const EMPTY_LIKED_IDS: ReadonlySet<string> = new Set();

type Props = {
  /** /product?tag=X, ?category=Y, ?view=liked — 서버 컴포넌트(page.tsx)가 읽어서 내려준다. page.tsx가
   *  조합으로 key를 줘서, 값이 바뀌면 이 컴포넌트가 통째로 새로 마운트된다(검색·정렬 초기화). */
  initialTag: string | null;
  initialCategory: string | null;
  initialViewMode: 'all' | 'liked' | null;
  /** mock 모드 전량 목록 — page.tsx가 서버에서 libraryItems()를 내려준다. real 모드는 빈 배열이고
   *  이 컴포넌트가 useCatalogPage로 카테고리별 20개씩 커서 페이징한다(2026-08-05). */
  products: ProductSpec[];
};

const ProductGrid = ({ initialTag, initialCategory, initialViewMode, products }: Props) => {
  const router = useRouter();
  const activeTag = initialTag;
  const isLikedView = initialViewMode === 'liked';

  // 사이드바 카테고리 선택 — 서버가 내려준 initialCategory는 첫 마운트 값일 뿐이고, 이후로는
  // TransitionNavigator.tsx가 History API로 URL만 바꾸고 쏘는 PRODUCT_CATEGORY_CHANGE_EVENT를
  // 받아 갱신한다(카테고리 전환이 서버 재조회·컴포넌트 리마운트 없는 순수 클라이언트 필터가 되도록,
  // 2026-08-03).
  const [categoryOverride, setCategoryOverride] = useState<string | null>(initialCategory);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);

  // URL의 category 쿼리를 그대로 반영하는 상수 — 전체 보기에선 바로가기 타일, 카테고리 보기에선
  // 좌측 사이드바(Link)로 이동해서 선택한다. 값은 그룹 key 또는 소분류 key(정적 정본,
  // constants/productCategoryGroup.ts — 2026-08-05 카테고리 API 소비 제거).
  const activeFilter = categoryOverride ?? ALL_FILTER;

  /** 카테고리 메뉴 — 정적 9그룹(전체 제외·기타 마지막). mock/real 구분이 없다. */
  const categoryMenu: ProductCategoryNavItem[] = PRODUCT_CATEGORY_NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    iconCategory: group.iconCategory,
  }));

  /** 없앤 카테고리의 옛 링크(accessory 등)나 미지의 key로 들어와도 null이 되어 아래 isAllView가
   *  참이 된다(빈 카테고리 화면이 뜨지 않는다). 소분류는 다중 선택(2026-08-05 사용자 요청)이라
   *  `?category=`에 콤마로 조인해 싣는다 — 첫 key가 정한 그룹과 같은 그룹의 소분류만 남긴다.
   *  useMemo — 매번 새 객체를 만들어 visibleProducts의 dep로 쓰기 때문. */
  const resolved = useMemo(() => {
    if (activeFilter === ALL_FILTER) return null;
    const keys = activeFilter.split(',');
    const first = resolveCategoryKey(keys[0]);
    if (!first) return null;
    const subs = keys
      .map((key) => resolveCategoryKey(key))
      .filter((r) => r !== null && r.group.key === first.group.key && r.sub !== null)
      .map((r) => r!.sub!);
    return { group: first.group, subs };
  }, [activeFilter]);
  /** 사이드바·칩 레일 활성 표시는 대분류 단위 — 소분류가 선택돼도 그 부모 그룹이 활성이다. */
  const activeCategoryKey = resolved?.group.key ?? null;
  /** 전체 보기 여부 — false면 카테고리 보기 */
  const isAllView = resolved === null;
  const activeLabel = resolved?.group.label ?? activeFilter;

  // real 모드는 카테고리별 서버 커서 페이징(20개, useCatalogPage). **검색은 2026-08-06부터
  // 서버가 한다**(GET /products?q=, Elasticsearch + Nori, ADR-0019) — 로드된 페이지 안에서만 걸러
  // 로드 안 된 제품이 안 잡히던 클라 이름 필터를 없앴다. 정렬·찜 필터는 여전히 로드된 페이지 범위다.
  // mock 모드는 훅이 no-op이고 page.tsx가 내려준 전량 배열을 기존 클라 경로로 쓴다(검색 포함).
  const serverPaged = !isMockApi();
  /** 입력 중인 검색어 — 타이핑만으로는 목록을 건드리지 않는다(목록 높이가 즉시 줄어 스크롤이 튀던 문제) */
  const [searchQuery, setSearchQuery] = useState('');
  // 목록과 달리 추천어는 타이핑을 따라온다(DERO-385) — 확정 전 입력값을 그대로 넘긴다.
  const suggestions = useSearchSuggestions(searchQuery);
  /** '검색' 버튼(또는 Enter)으로 확정된 검색어 — real 모드는 이 값이 서버로 나간다 */
  const [appliedQuery, setAppliedQuery] = useState('');
  const categoryIds =
    resolved === null
      ? null
      : resolved.subs.length > 0
        ? [...new Set(resolved.subs.flatMap(categoryIdsOf))]
        : categoryIdsOf(resolved.group);
  const { state, isLoadingMore, loadMore, retry } = useCatalogPage(categoryIds, appliedQuery);
  // useMemo — 로딩 중 빈 배열을 렌더마다 새로 만들면 아래 recentProducts/visibleProducts의
  // dep이 매번 갈린다(react-hooks/exhaustive-deps).
  const catalogProducts = useMemo(
    () => (serverPaged ? (state.status === 'loaded' ? state.specs : []) : products),
    [serverPaged, state, products],
  );
  const loadFailed = serverPaged && state.status === 'failed';
  const isInitialLoading = serverPaged && state.status === 'loading';
  const serverHasNext = serverPaged && state.status === 'loaded' && state.hasNext;
  /** ES가 죽었다 — 폴백이 없는 것이 결정이라(ADR-0019 결정 6) 화면이 그렇다고 말해야 한다.
   *  조용히 0건으로 보이면 "그런 제품이 없다"는 거짓말이 된다. */
  const searchUnavailable = serverPaged && state.status === 'search-unavailable';

  // '새로 등록된 제품' — 전체 보기에서만 보여준다. 카테고리 보기에서는 아예 렌더하지 않는다
  // (2026-08-03 사용자 확인 — 카테고리별로 뜨는 게 오히려 불필요하다는 피드백).
  //
  // 종전 제목은 '최근 많이 팔린 상품'이었고 getLikeCount() 내림차순으로 골랐는데, 실 카탈로그
  // 제품은 PRODUCT_CONTENT에 없어 그 값이 전부 정확히 10이었다 — 같은 값이면 stable sort라
  // 원본 순서가 그대로 나오고, 아래 그리드의 기본 정렬(당시 '인기순' = 목업 usageCount, 이쪽도 전
  // 제품 DEFAULT_CONTENT 상수)도 같은 이유로 원본 순서라 두 목록의 앞 4장이 완전히 겹쳤다
  // (2026-08-02 사용자 지적). 백엔드에 판매량·조회수·likeCount 필드가 없어 "많이 팔린"을 계산할
  // 근거 자체가 없으므로, 근거가 있는 기준(등록 순서의 역순 — 아래 'latest' 정렬과 같은 전제)으로
  // 바꾸고 제목도 거기 맞췄다. 이제 캐러셀은 뒤에서부터, 그리드는 앞에서부터라 겹치지 않는다.
  //
  // likedIds에는 의존하지 않는다 — 의존하면 좋아요를 누르는 즉시 카드 순서가 바뀌어 화면이
  // 들썩인다(커뮤니티의 "많이 방문한" 캐러셀과 같은 이유).
  // real 모드는 로드된 페이지 범위에서만 역순을 뽑는다(백엔드가 id 오름차순만 지원해 진짜 최신을
  // 못 뽑음 — 2026-08-05 사용자 확인 "로드된 범위에서 역순 표시"; 최신순 정렬 파라미터가 생기면 승격).
  const recentProducts = useMemo(
    () => [...catalogProducts].reverse().slice(0, RECENT_PRODUCT_COUNT),
    [catalogProducts],
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>('registered');

  // 사이드바 카테고리 선택 — TransitionNavigator.tsx가 History API로 URL만 바꾸고 쏘는
  // PRODUCT_CATEGORY_CHANGE_EVENT를 받아 갱신한다(카테고리 전환이 서버 재조회·컴포넌트 리마운트
  // 없는 순수 클라이언트 필터가 되도록, 2026-08-03). 예전엔 page.tsx의 key로 ProductGrid 전체가
  // 리마운트되며 검색어·정렬이 공짜로 초기화됐는데, 리마운트를 없앤 대신 여기서 그대로 재현한다.
  useEffect(() => {
    const handleCategoryChange = (event: Event) => {
      const { category } = (event as CustomEvent<{ category: string | null }>).detail;

      // 카테고리를 바꾸면 기존 카드와 전체 보기 캐러셀이 먼저 사라지고 새 목록이 로드된다. 이때
      // 문서 높이가 순간적으로 줄면 브라우저가 현재 scrollY를 유지할 수 없어 최상단으로 보정한 뒤
      // 아래 scrollIntoView가 다시 실행되는 두 단계 점프가 생긴다. 새 목록이 준비될 때까지 현재
      // 콘텐츠 높이를 고정해, 지금 위치에서 목표 지점으로 한 번만 부드럽게 이동하게 한다.
      const contentColumn = contentColumnRef.current;
      if (contentColumn) {
        contentColumn.style.minHeight = `${contentColumn.offsetHeight}px`;
      }
      setCategoryOverride(category);
      setSearchQuery('');
      setAppliedQuery('');
      setSortOrder('registered');
      // 카테고리 전환으로 상단 캐러셀 등이 사라진 뒤의 최종 레이아웃을 기준으로 맞춘다.
      // 두 프레임을 기다려야 이전 위치가 아니라 새 제품 목록 제목 위치로 정확히 이동한다.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          listHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    };
    window.addEventListener(PRODUCT_CATEGORY_CHANGE_EVENT, handleCategoryChange);
    return () => window.removeEventListener(PRODUCT_CATEGORY_CHANGE_EVENT, handleCategoryChange);
  }, []);

  // 새 카테고리 목록이 준비된 뒤에는 임시 높이를 해제한다. 고정한 영역은 제목 아래까지 포함하므로
  // 해제해도 이미 맞춘 제목 위치가 다시 움직이지 않는다.
  useEffect(() => {
    if (serverPaged && state.status !== 'loaded' && state.status !== 'failed') return;
    const frame = window.requestAnimationFrame(() => {
      contentColumnRef.current?.style.removeProperty('min-height');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverPaged, state.status]);

  // 뒤로/앞으로 가기 — 카테고리 전환은 Next 라우터를 거치지 않는 순수 history.pushState/replaceState라
  // Next의 popstate 처리가 이 변화를 모른다. 브라우저가 그 엔트리로 돌아오면 URL은 바뀌지만
  // categoryOverride는 그대로 남아 사이드바·목록이 어긋나므로 직접 동기화한다(검색어·정렬까지 되돌리진
  // 않는다 — 뒤로가기는 "새 카테고리 진입"이 아니라 이전 화면 복원에 가깝다).
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname !== '/product') return;
      setCategoryOverride(new URLSearchParams(window.location.search).get('category'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 좋아요한 제품 id — 상세 페이지(ProductLikeControl)와 같은 스토어를 구독한다. 예전엔 이 컴포넌트가
  // 로컬 useState로 들고 있어 목록에서 좋아요를 누르고 상세로 들어가면 해제된 것처럼 보였다.
  const storedLikedIds = useProductLikesStore((s) => s.likedIds);
  const toggleLikeStore = useProductLikesStore((s) => s.toggleLike);
  const requireAuth = useRequireAuth();
  const isAuthenticated = useIsAuthenticated();
  // localStorage 좋아요는 로그인 여부와 무관하게 남아 있다(브라우저 단위 저장) — 로그인해서 눌렀다가
  // 로그아웃해도 하트가 채워진 채로 보이면 안 되므로, 비로그인일 때는 화면 표시만 강제로 비운다.
  // 토글 자체는 이미 handleToggleLike의 requireAuth가 막는다.
  const likedIds = isAuthenticated ? storedLikedIds : EMPTY_LIKED_IDS;
  /** 토스트를 그리드가 소유해야 카드를 연달아 눌러도 토스트가 겹치지 않는다 */
  const [likeToast, setLikeToast] = useState<'added' | 'removed' | null>(null);
  const handleToggleLike = (id: string) => {
    if (!requireAuth()) return;
    const willLike = toggleLikeStore(id);
    setLikeToast(willLike ? 'added' : 'removed');
  };

  /** 검색어를 즉시 확정하고 '전체 제품' 제목으로 스크롤을 맞춘다 */
  const applySearch = (value: string) => {
    setSearchQuery(value);
    setAppliedQuery(value.trim());
    listHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const handleSearch = () => applySearch(searchQuery);

  /** 추천어를 고르면 그 자리에서 검색까지 확정한다 — 고른 뒤 '검색'을 또 누르게 하지 않는다. */
  const handlePickSuggestion = (value: string) => {
    suggestions.close(value);
    applySearch(value);
  };

  /** 검색어만 지운다 — 카테고리 선택은 건드리지 않는다(검색 서버가 죽었을 때의 탈출구) */
  const handleClearSearch = () => {
    setSearchQuery('');
    setAppliedQuery('');
  };

  const handleSelectAllProducts = () => {
    setCategoryOverride(null);
    setSearchQuery('');
    setAppliedQuery('');
    setSortOrder('registered');
    requestAnimationFrame(() => {
      listHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const visibleProducts = useMemo(() => {
    const query = appliedQuery.toLowerCase();
    const filtered = catalogProducts.filter((product: ProductSpec) => {
      const matchesView = !isLikedView || likedIds.has(product.id);
      // real 모드는 서버가 categoryId로 이미 걸러 줬다 — 이름 매칭 클라 필터를 겹치면 라벨과
      // 카테고리명이 다른 제품('머그'≠'컵' 등)이 떨어져 나간다. mock만 정적 정본의 클라 필터를
      // 탄다(소분류 선택 시 OR, 아니면 대분류).
      const matchesFilter =
        serverPaged ||
        resolved === null ||
        (resolved.subs.length > 0
          ? resolved.subs.some((sub) => matchesCategoryFilter(product, sub))
          : matchesCategoryFilter(product, resolved.group));
      const matchesTag = !activeTag || getProductContent(product.id).themeTags.includes(activeTag);
      // real 모드는 서버(Elasticsearch)가 이미 걸러 줬다 — 이름 includes를 겹치면 색인이 잡아낸
      // 제품(띄어쓰기·형태소가 다른 이름, 브랜드 매칭)이 도로 떨어져 나간다. mock만 정적 정본의
      // 클라 필터를 탄다. 실 카탈로그 제품은 category(닫힌 유니온)가 없다 — categoryName으로
      // 폴백 (DERO-325).
      const categoryLabel = product.category
        ? CATEGORY_LABEL[product.category]
        : (product.categoryName ?? '');
      const matchesQuery =
        serverPaged ||
        query === '' ||
        product.name.toLowerCase().includes(query) ||
        categoryLabel.toLowerCase().includes(query);
      return matchesView && matchesFilter && matchesTag && matchesQuery;
    });

    switch (sortOrder) {
      // 등록순 — 카탈로그(three/scene/product.ts PRODUCTS)에 등록일 필드가 없어 배열 순서를 등록
      // 순서로 본다('최신순'이 이걸 뒤집은 것과 같은 전제). filter가 원본 순서를 보존하므로 그대로
      // 낸다. 종전엔 '인기순'이라는 이름으로 목업 상수 usageCount 내림차순이었는데, 실 카탈로그
      // 제품은 그 값이 전부 같아(PRODUCT_CONTENT 미등록) 이미 이 순서와 동일했다 (2026-08-03).
      case 'registered':
        return filtered;
      case 'price-asc':
      case 'price-desc': {
        const direction = sortOrder === 'price-asc' ? 1 : -1;
        return [...filtered].sort(
          (a, b) => direction * (getDisplayPriceKrw(a) - getDisplayPriceKrw(b)),
        );
      }
      case 'latest':
        // 카탈로그(three/scene/product.ts PRODUCTS)에 등록일 필드가 없다 — 배열에 나중에 실린
        // 항목이 최근 추가된 것이라는 전제로, 등록 순서(filter가 보존한 원본 순서)를 뒤집는다.
        return [...filtered].reverse();
    }
  }, [
    catalogProducts,
    serverPaged,
    isLikedView,
    likedIds,
    resolved,
    activeTag,
    appliedQuery,
    sortOrder,
  ]);

  // "N개" — 서버가 준 전체 개수(CursorPage.totalCount)를 쓴다. 종전엔 visibleProducts.length라
  // 스크롤할수록 20 → 40 → 60으로 늘어났고, 그건 "로드된 만큼"이지 전체가 아니었다.
  // 다만 좋아요 보기·테마 태그는 **서버가 모르는 클라 필터**라 그 둘이 걸려 있으면 서버 개수가
  // 과대 집계다 — 그때는 예전처럼 화면에 실제로 남은 개수를 센다.
  const clientNarrowed = isLikedView || activeTag !== null;
  const displayCount =
    serverPaged && !clientNarrowed && state.status === 'loaded'
      ? state.totalCount
      : visibleProducts.length;

  return (
    <div>
      {/* 광고 배너 — 전체/카테고리 보기 어느 쪽이든 항상 맨 위에 뜬다(사이드바·쇼케이스와 무관) */}
      <ProductPromoBanner />

      {/* md 미만에서는 사이드바가 숨겨져 카테고리를 바꿀 수단이 없어진다 — 그 구간 전용 가로 칩
        레일. 2단 flex 바깥(배너 바로 아래)에 두는 게 1단 레이아웃에서 자연스럽다. */}
      <ProductCategoryChipRail groups={categoryMenu} activeCategory={activeCategoryKey} />

      {/* 항상 좌측 사이드바 + 우측 콘텐츠 2단(오늘의집류) — 사이드바는 md 미만에서 숨긴다.
        전체 보기에서는 사이드바의 '전체 제품'이 활성(볼드)으로 표시된다. */}
      <div className="flex items-start gap-8">
        <ProductCategorySidebar
          groups={categoryMenu}
          activeCategory={activeCategoryKey}
          onSelectAllProducts={handleSelectAllProducts}
        />

        <div ref={contentColumnRef} className="min-w-0 flex-1">
          {/* 자동 넘김·하단 바 없이 이미지 위 중앙 좌우 버튼으로만 넘긴다(2026-08-03 사용자 요청 —
            자동 넘김+하단 바는 상단 광고 배너로 옮겨갔다) */}
          {isAllView && recentProducts.length > 0 && (
            // 섹션 간격 — 디자인 시스템의 섹션 간격은 96px(모바일 48px)이지만 카드 그리드가 이미
            // 세로 40px 리듬이라 96px은 이 화면에서 과하다. 80px(sm:mb-20)로 타협한다.
            <section className="mb-12 sm:mb-20">
              <h2 className="text-ink mb-4 text-[22px] font-medium">새로 등록된 제품</h2>
              <AutoCarousel
                items={recentProducts}
                getKey={(product) => product.id}
                renderItem={(product) => (
                  <ProductCard
                    product={product}
                    isLiked={likedIds.has(product.id)}
                    onToggleLike={handleToggleLike}
                  />
                )}
                step={RECENT_CAROUSEL_STEP}
                itemBasisClassName="basis-[calc((100%-12px)/2)] sm:basis-[calc((100%-36px)/4)]"
                visibleCount={4}
                autoPlay={false}
                controls="overlay"
              />
            </section>
          )}

          {/* scroll-mt-24 — 고정(sticky) 헤더 높이(64px)에 가리지 않도록 여유를 둔다. 상단 메뉴바의
          "제품"을 직접 눌러 카테고리 없이 들어오면 "전체 제품", 소메뉴(카테고리)를 눌러 들어오면
          "전체 제품 > 카테고리"로 표시한다(2026-08-06, "제품 > 카테고리"에서 개정 — 첫 세그먼트가
          무엇의 전체인지 불분명하다는 지적). **마지막 세그먼트(지금 보고 있는 자리)는 링크가 아니다**
          (2026-08-06 2차 요청 — "이미 여기 있는데 커서·클릭이 되는 게 이상하다") — 소분류가
          없으면 카테고리 세그먼트가 마지막이라 텍스트, 소분류가 있으면 그 목록이 마지막이라
          카테고리 세그먼트는 여전히 링크(눌러서 소분류 필터를 걷어낸다). */}
          <h2
            ref={listHeadingRef}
            className="text-ink mb-4 flex scroll-mt-24 items-center gap-3 text-[22px] font-medium"
          >
            <span>
              {resolved === null ? (
                '전체 제품'
              ) : (
                <>
                  <Link
                    href="/product"
                    onClick={handleSelectAllProducts}
                    className="hover:underline"
                  >
                    전체 제품
                  </Link>{' '}
                  <span className="text-ash">&gt;</span>{' '}
                  {resolved.subs.length > 0 ? (
                    <Link
                      href={`/product?category=${encodeURIComponent(resolved.group.key)}`}
                      className="hover:underline"
                    >
                      {activeLabel}
                    </Link>
                  ) : (
                    activeLabel
                  )}
                  {resolved.subs.length > 0 && (
                    <>
                      {' '}
                      <span className="text-ash">&gt;</span>{' '}
                      {resolved.subs.map((sub) => sub.label).join(', ')}
                    </>
                  )}
                </>
              )}
            </span>
            <span className="text-ash text-[13px] font-normal">{displayCount}개</span>
          </h2>

          <div className="mb-4 flex w-full items-center gap-2 sm:max-w-[420px]">
            <SortDropdown
              options={SORT_OPTIONS}
              value={sortOrder}
              onChange={(next) => setSortOrder(next as SortOrder)}
            />
            {/* 커뮤니티 검색창(CommunityGallery.tsx)과 같은 pill + 돋보기 아이콘 스타일(2026-08-02
            사용자 요청) — 아이콘 자체가 버튼이라 hover 시 커서가 바뀌고 클릭하면 검색이 확정된다. */}
            {/* 추천어 드롭다운을 검색 pill 기준으로 띄우기 위한 래퍼 — 목록을 밀어내지 않는다 */}
            <div className="relative flex min-w-0 flex-1">
              <label className="border-ash/40 bg-paper focus-within:border-ink flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border px-4 transition-colors">
                <button
                  type="button"
                  onClick={handleSearch}
                  aria-label="검색"
                  className={`text-ash hover:text-ink shrink-0 cursor-pointer rounded-full transition-colors ${FOCUS_RING_CLASS}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                    <path
                      d="M11 11 14.5 14.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    // 추천어를 짚고 있을 때만 훅이 Enter를 가져간다 — 아니면 원래대로 검색 확정이다.
                    if (suggestions.onKeyDown(event, handlePickSuggestion)) return;
                    if (event.key === 'Enter') handleSearch();
                  }}
                  onBlur={() => window.setTimeout(() => suggestions.close(), 120)}
                  role="combobox"
                  aria-expanded={suggestions.items.length > 0}
                  aria-controls="product-search-suggestions"
                  aria-autocomplete="list"
                  placeholder="제품명, 카테고리로 검색"
                  className="text-ink placeholder:text-ash w-full min-w-0 text-[15px] outline-none"
                />
              </label>
              {suggestions.items.length > 0 && (
                <ul
                  id="product-search-suggestions"
                  role="listbox"
                  data-testid="product-search-suggestions"
                  className="border-ash/40 bg-paper absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl border p-1 shadow-lg"
                >
                  {suggestions.items.map((item, index) => (
                    <li key={item}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === suggestions.highlighted}
                        onMouseEnter={() => suggestions.highlight(index)}
                        // blur보다 먼저 도는 pointerdown에서 고른다 — click까지 기다리면 위 blur
                        // 타이머와 경합해 가끔 안 먹는다.
                        onPointerDown={(event) => {
                          event.preventDefault();
                          handlePickSuggestion(item);
                        }}
                        className={
                          index === suggestions.highlighted
                            ? 'text-ink bg-fog w-full cursor-pointer rounded-xl px-3 py-2 text-left text-[14px]'
                            : 'text-ink w-full cursor-pointer rounded-xl px-3 py-2 text-left text-[14px]'
                        }
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 전체 보기 바로가기 타일 — 정적 9그룹, 3D-icon(webp)으로 통일(2026-08-05 사용자 지시,
            옛 public/assets/product/categories 쇼케이스 이미지 시스템 삭제). Link라
            TransitionNavigator의 카테고리 전용 인터셉트를 그대로 탄다. */}
          {isAllView && (
            <div
              className="mb-8 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5 xl:grid-cols-9"
              aria-label="제품 카테고리 바로가기"
            >
              {PRODUCT_CATEGORY_NAV_GROUPS.map((group) => (
                <Link
                  key={group.key}
                  href={`/product?category=${encodeURIComponent(group.key)}`}
                  className={`group flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-xl ${FOCUS_RING_CLASS}`}
                >
                  <span className="bg-fog group-hover:border-primary-400 border-ash/20 flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border transition-all duration-200 group-hover:-translate-y-1">
                    <ProductCategoryIcon
                      category={group.iconCategory}
                      width={72}
                      height={72}
                      className="h-full w-full object-contain p-3"
                    />
                  </span>
                  <span className="text-ink text-center text-[14px] font-medium">
                    {group.label}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* 소분류 태그 행 — children이 있는 대분류에서만. 같은 `?category=` 파라미터 공간
            (다중 선택은 콤마 조인)을 쓰는 Link라 클릭도 카테고리 전용 인터셉트(순수 클라
            필터)를 탄다. 활성 칩 재클릭 = 그 칩만 해제, 전부 해제되면 대분류로 복귀. */}
          {resolved?.group.children && (
            <div className="mb-6 flex flex-wrap gap-2" aria-label="소분류">
              {resolved.group.children.map((sub) => {
                const isSelected = resolved.subs.some((s) => s.key === sub.key);
                const nextKeys = isSelected
                  ? resolved.subs.filter((s) => s.key !== sub.key).map((s) => s.key)
                  : [...resolved.subs.map((s) => s.key), sub.key];
                const nextParam = nextKeys.length > 0 ? nextKeys.join(',') : resolved.group.key;
                return (
                  <Link
                    key={sub.key}
                    href={`/product?category=${encodeURIComponent(nextParam)}`}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[14px] transition-colors ${FOCUS_RING_CLASS} ${
                      isSelected
                        ? 'bg-ink text-paper font-medium'
                        : 'border-ash/40 text-ink hover:bg-fog border'
                    }`}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          )}

          {activeTag && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-ash text-[14px]">테마 태그</span>
              <button
                type="button"
                onClick={() => router.push('/product')}
                aria-label={`테마 태그 ${activeTag} 필터 해제`}
                className={`bg-ink text-paper flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3 py-1 text-[14px] ${FOCUS_RING_CLASS}`}
              >
                {activeTag}
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )}

          {/* 좋아요 토스트의 '좋아요 목록 보기'로 들어왔을 때의 표시 — activeTag 칩과 같은 자리·모양,
          닫으면 필터 없는 /product로 돌아간다 */}
          {isLikedView && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-ash text-[14px]">보기</span>
              {/* bg-ink — 종전 bg-danger-500은 디자인 시스템 §1.4에서 호환성 판정 '불가' 전용
                축이라 "필터가 켜져 있다"는 중립 표시에 쓰면 안 된다. 위 태그 칩과 같은 역할이므로
                색도 같은 bg-ink로 맞춘다(2026-08-02) */}
              <button
                type="button"
                onClick={() => router.push('/product')}
                aria-label="좋아요한 제품 필터 해제"
                className={`bg-ink text-paper flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3 py-1 text-[14px] ${FOCUS_RING_CLASS}`}
              >
                좋아요한 제품
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )}

          {/* 세 상태를 회색 한 줄로 공용하던 걸 갈랐다(2026-08-02) — 로드 실패는 재시도 수단이
            아예 없었고, 빈 목록은 다음 행동을 안내하지 않았다. real 모드 첫 페이지 대기는
            빈 목록과 구분해 스피너를 돌린다. */}
          {searchUnavailable ? (
            /* 검색만 죽었다 — 목록 자체는 멀쩡하므로 화면을 비우지 않고 사실을 말한 뒤
               검색어를 지우면 되는 길을 남긴다(ADR-0019 결정 6, 폴백 없음). */
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <InlineNotice
                variant="error"
                title="검색을 일시적으로 사용할 수 없습니다"
                message="검색 서버에 문제가 있어 결과를 가져오지 못했습니다. 잠시 후 다시 시도해주세요. 검색어를 지우면 제품 목록은 그대로 보실 수 있습니다."
              />
              <button
                type="button"
                onClick={handleClearSearch}
                className={`border-ash/40 text-ink hover:bg-fog rounded-full border px-4 py-2 text-[14px] transition-colors ${FOCUS_RING_CLASS}`}
              >
                검색어 지우기
              </button>
            </div>
          ) : loadFailed ? (
            <ErrorState
              description="제품을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
              onRetry={retry}
            />
          ) : isInitialLoading ? (
            <div className="flex justify-center py-16" aria-busy="true">
              <div
                className="border-ash/30 border-t-ink h-8 w-8 animate-spin rounded-full border-2"
                aria-hidden="true"
              />
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-[16px] text-neutral-600">
                {isLikedView
                  ? '아직 좋아요한 제품이 없어요.'
                  : appliedQuery
                    ? `'${appliedQuery}'에 해당하는 제품이 없어요.`
                    : '해당 카테고리의 제품이 없어요.'}
              </p>
              <Link
                href="/product"
                onClick={handleSelectAllProducts}
                className={`border-ash/40 text-ink hover:bg-fog rounded-full border px-4 py-2 text-[14px] transition-colors ${FOCUS_RING_CLASS}`}
              >
                전체 제품 보러가기
              </Link>
            </div>
          ) : (
            // 검색어·정렬·카테고리가 바뀌면 목록이 통째로 달라지므로 key로 리마운트해 펼친 개수를
            // 되감는다. 카테고리는 더 이상 page.tsx의 리마운트에 얹혀가지 않으므로(클라이언트 상태로
            // 승격, 2026-08-03) 여기서 직접 key에 포함한다. 테마 태그·좋아요 보기는 여전히 page.tsx가
            // ProductGrid 자체를 리마운트한다.
            <ProductCardGrid
              key={`${appliedQuery}\u0000${sortOrder}\u0000${categoryOverride ?? ''}`}
              products={visibleProducts}
              likedIds={likedIds}
              onToggleLike={handleToggleLike}
              hasNext={serverHasNext}
              isLoadingMore={isLoadingMore}
              onLoadMore={serverPaged ? loadMore : undefined}
            />
          )}

          {likeToast && (
            <Toast
              message={
                likeToast === 'added' ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.'
              }
              actionLabel="좋아요 목록 보기"
              actionColorClassName="text-danger-500"
              onAction={() => {
                setLikeToast(null);
                // 마이페이지 '찜하기'가 제품 좋아요 목록의 정본이다 — ProductLikeControl과 같은 목적지
                router.push('/mypage?menu=wishlist');
              }}
              onDismiss={() => setLikeToast(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductGrid;
