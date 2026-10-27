'use client';
// 제품 목록 — 검색 + 카테고리 선택 버튼 그리드(전체 1개 + 대분류 9개, 정본은
// constants/productCategoryGroup.ts의 정적 10그룹 — 2026-08-05 사용자 확정으로 GET /categories
// 소비 제거) + 고른 대분류에 소분류(children)가 있으면 브레드크럼 아래 칩 행 + 선택된 카테고리의
// 제품 갤러리를 세로로 쌓는다(2026-08-04 사용자 요청 — 드롭다운/아코디언이 아니라 그리드 버튼으로).
// 이전 이력: 항상 노출되던 태그 pill 행 → 네이티브 select(2026-07-27) → 커스텀 커튼 드롭다운
// → 카테고리 행 아코디언(2026-07-31, 고른 카테고리 아래로 갤러리가 펼쳐짐) → 세로 1열 목록
// (2026-08-04) → 지금의 2열 타일 그리드(2026-08-05 사용자 확인, 아이콘 40px 위 + 라벨 아래 카드형).
// 그리드는 아코디언과 달리 갤러리를 인라인으로 펼치지 않는다 — 그리드 바로 아래 갤러리 하나가
// 선택에 따라 내용만 바뀐다(그리드 자체는 항상 그대로 보인다).
// 이 패널 자체에는 닫기 버튼도 접기 버튼도 없다(2026-08-05 제거) — 완전히 닫으려면 좌측
// 레일의 '제품' 아이콘을 다시 누른다(`EditorSidebar.tsx`의 기존 토글). `<`/`>` 접기 손잡이는
// 우측 `EstimatePanel`에만 있다(사용자 확인: "왼쪽 tool bar에는 < 버튼 없애줘").
// 카드는 드래그로 책상에 배치한다. 좌측 레일의 '제품' 플라이아웃 안에서만 렌더된다.

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import DeroLogo from '@/assets/dero_logo.svg';
import type { ProductSpec } from '@/three/scene/product';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useCatalogPage } from '@/hooks/useCatalogPage';
import { useCatalogVersion } from '@/hooks/useCatalogVersion';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import { isMockApi } from '@/constants/api';
import {
  categoryIdsOf,
  matchesCategoryFilter,
  PRODUCT_CATEGORY_NAV_GROUPS,
} from '@/constants/productCategoryGroup';
import ProductCategoryIcon from '@/components/product/ProductCategoryIcon';
import LikeButton from '@/components/common/LikeButton';
import RemoteImage from '@/components/common/RemoteImage';
import InlineNotice from '@/components/common/InlineNotice';
import Toast from '@/components/common/Toast';
import { useProductLikesStore } from '@/store/productLikesStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { requestSimulatorExitNavigation } from '@/utils/simulatorExit';

export type GalleryEntry = { kind: 'local'; spec: ProductSpec };

// 실 카탈로그 제품은 imageUrl(대표 실사 이미지)을 우선한다 — 없으면(mock 카탈로그) 기존
// 빌드타임 정적 PNG로 폴백한다 (DERO-325, ADR-0017 결정 1).
const thumbnailUrl = (spec: ProductSpec): string =>
  spec.imageUrl ?? `/assets/thumbnails/${spec.id}.png`;
// 무한 스크롤 배치 크기 — 갤러리 스크롤이 바닥 근처(sentinel)에 닿을 때마다 이만큼 더 붙인다.
const BATCH_SIZE = 6;

// 갤러리 로딩 표시 — "불러오는 중…" 텍스트 대신 가운데 회전 원(2026-08-05 사용자 요청).
// 마크업·클래스는 LoadingScreen.tsx의 .spinner를 그대로 재사용한다.
const LoadingSpinnerRow = () => (
  <div className="lib-loading" aria-hidden="true">
    <svg className="spinner" viewBox="0 0 44 44">
      <circle className="spinner-track" cx="22" cy="22" r="18" />
      <circle className="spinner-arc" cx="22" cy="22" r="18" />
    </svg>
  </div>
);

const GalleryCard = ({
  entry,
  showLikeButton,
  onLikeChange,
}: {
  entry: GalleryEntry;
  showLikeButton: boolean;
  onLikeChange?: (isLiked: boolean) => void;
}) => {
  const placement = useSimulatorStore((s) => s.placement);
  const likedIds = useProductLikesStore((s) => s.likedIds);
  const toggleLike = useProductLikesStore((s) => s.toggleLike);
  const requireAuth = useRequireAuth();
  const isAuthenticated = useIsAuthenticated();
  const ref = useRef<HTMLDivElement>(null);
  const { spec } = entry;

  useEffect(() => {
    if (!placement || !ref.current) return;
    placement.attachLibraryDrag(ref.current, spec.id);
  }, [placement, spec]);

  const isLiked = isAuthenticated && likedIds.has(spec.id);

  return (
    <div ref={ref} className="lib-card" data-testid={`lib-card-${spec.id}`}>
      <RemoteImage
        className="lib-thumb"
        src={thumbnailUrl(spec)}
        alt={spec.name}
        width={160}
        height={160}
        sizes="160px"
        draggable={false}
      />
      {showLikeButton && (
        <div
          onPointerDownCapture={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <LikeButton
            isLiked={isLiked}
            onToggle={() => {
              if (!requireAuth()) return;
              onLikeChange?.(toggleLike(spec.id));
            }}
            isOverlay
            overlayPositionClassName="top-3 right-3"
          />
        </div>
      )}
      <span className="lib-name">{spec.name}</span>
    </div>
  );
};

/** 카테고리 라벨은 위 그리드 버튼에 이미 드러나므로 여기서 다시 그리지 않는다.
 *  스크롤 컨테이너(overflow-y:auto)와 sentinel을 이 컴포넌트가 직접 소유해야
 *  IntersectionObserver의 root를 정확히 이 갤러리로 지정할 수 있다 — **뷰포트를 root로 두면
 *  안 된다**(sentinel이 처음부터 보이는 것으로 판정돼 전량 즉시 로드된다). */
/** LikedProductsPanel.tsx도 이 갤러리(무한 스크롤·드래그 배치)를 그대로 재사용한다 —
 *  카테고리 그리드·검색 없이 이미 필터된 entries만 넘기면 된다. */
export const GallerySection = ({
  entries,
  testId,
  className = '',
  emptyMessage = '아직 등록된 오브젝트가 없습니다',
  isInitialLoading = false,
  hasNext = false,
  isLoadingMore = false,
  onLoadMore,
  showLikeButton = false,
  onLikeChange,
}: {
  entries: GalleryEntry[];
  testId: string;
  className?: string;
  emptyMessage?: string;
  isInitialLoading?: boolean;
  /** 서버 페이징: 아직 더 받을 페이지가 있는가. onLoadMore와 세트다. */
  hasNext?: boolean;
  isLoadingMore?: boolean;
  /** 넘기면 서버 페이징 모드 — 클라이언트 배칭을 끄고 센티널이 다음 **페이지 요청**을 부른다.
   *  안 넘기면(LikedProductsPanel 등) 예전 그대로 이미 받은 배열을 BATCH_SIZE씩 잘라 보여준다. */
  onLoadMore?: () => void;
  /** 제품 라이브러리에서만 좋아요 버튼을 노출한다. 찜 목록은 기존 목록 갱신 계약을 유지한다. */
  showLikeButton?: boolean;
  onLikeChange?: (isLiked: boolean) => void;
}) => {
  const serverPaged = onLoadMore !== undefined;
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 서버 페이징 모드에선 서버 페이지(20개)가 곧 배치다 — 클라 배치 6개가 그 위에 이중으로
  // 걸리면 센티널이 페이지를 다 소진하기 전에 멈춘다.
  const visibleEntries = serverPaged ? entries : entries.slice(0, visibleCount);
  const hasMore = serverPaged ? hasNext : visibleCount < entries.length;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([sentinelEntry]) => {
        if (!sentinelEntry.isIntersecting) return;
        if (serverPaged) {
          onLoadMore();
          return;
        }
        setVisibleCount((c) => Math.min(entries.length, c + BATCH_SIZE));
      },
      { root, rootMargin: '80px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // visibleCount가 빠지면 안 된다 — IntersectionObserver는 경계 **교차**에만 발화하므로
    // 한 배치를 붙인 뒤에도 센티널이 계속 보이는 상태면 다시는 안 불린다(ProductGrid.tsx의 교훈).
  }, [entries.length, hasMore, serverPaged, onLoadMore, visibleCount]);

  return (
    <div
      ref={scrollRef}
      className={`hud-gallery ${className}`.trim()}
      data-testid={testId}
      aria-busy={isInitialLoading || isLoadingMore}
    >
      <div className="hud-gallery-inner">
        {entries.length > 0 ? (
          <div className="lib-grid">
            {visibleEntries.map((entry) => (
              <GalleryCard
                key={`${entry.kind}-${entry.spec.id}`}
                entry={entry}
                showLikeButton={showLikeButton}
                onLikeChange={onLikeChange}
              />
            ))}
          </div>
        ) : isInitialLoading ? (
          <LoadingSpinnerRow />
        ) : (
          // 빈 상태 — 텅 빈 상자 아이콘 + 문구를 가운데 배치(2026-08-05 사용자 요청)
          <div className="lib-empty-state">
            <svg
              viewBox="0 0 24 24"
              width={36}
              height={36}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
              <path d="M3 8.5V16l9 4.5V13" />
              <path d="M21 8.5V16l-9 4.5" />
            </svg>
            <p className="lib-empty">{emptyMessage}</p>
          </div>
        )}
        {hasMore && <div ref={sentinelRef} className="hud-gallery-sentinel" aria-hidden="true" />}
        {isLoadingMore && <LoadingSpinnerRow />}
      </div>
    </div>
  );
};

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width={15}
    height={15}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.35-4.35" />
  </svg>
);

/** 카테고리 그리드 첫 칸 — 카테고리와 무관하게 전체 제품을 보여준다. 2026-08-04부터 기본
 *  선택값이 아니다(제품 팝업을 처음 열면 목록 없이 그리드만 보인다 — 사용자가 이 칸을 포함해
 *  어느 타일이든 직접 눌러야 목록이 뜬다). 이 타일만 카테고리 아이콘 대신 DERO 로고를
 *  그린다(2026-08-05 사용자 요청 "전체 icon 제거" → "전체 부분에는 dero icon 으로 추가"). */
const DEFAULT_KEY = 'all';

/** 검색 입력 확정을 늦추는 시간(ms) — 이 입력창은 확정 버튼이 없어 타이핑마다 서버로 나간다. */
const SEARCH_DEBOUNCE_MS = 300;

const LibraryPanel = () => {
  // 카테고리를 고르기 전엔 목록을 보여주지 않는다(2026-08-04 사용자 요청) — 초기값 null,
  // 그리드에서 아무 타일도 active로 안 잡힌다('전체'를 눌러야 그때부터 목록이 뜬다).
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // 고른 대분류 안의 소분류 칩 토글 — 다중 선택(2026-08-05 사용자 요청), 대분류를 바꾸면 초기화.
  const [activeSubKeys, setActiveSubKeys] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [likeToast, setLikeToast] = useState<'added' | 'removed' | null>(null);
  const mock = isMockApi();

  // 검색어가 있으면 카테고리와 무관하게 전체를 훑는다 — 검색 중엔 카테고리
  // 그리드를 대신해 검색 결과 하나만 보여준다(검색창·그리드 자체는 항상 보인다).
  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  // real 모드 검색은 서버 요청이다(GET /products?q=, ADR-0019). 이 입력창은 확정 버튼이 없어
  // 타이핑마다 반응하므로, 키 입력마다 요청이 나가지 않게 확정을 늦춘다. 한 번에 하나의
  // 커스텀 훅으로 뽑지 않는 건 소비자가 여기뿐이기 때문이다(rules/nextjs/hooks.md).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(trimmedQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmedQuery]);
  /** 입력은 됐지만 아직 서버에 안 나간 상태 — 이전 검색어의 결과를 잠깐 보여주는 대신 로딩을 돌린다 */
  const searchPending = trimmedQuery !== debouncedQuery;

  // 추천어 드롭다운(DERO-385). 목록 갱신과 별개의 ES 자료구조(completion suggester)라
  // 목록 디바운스(300ms)보다 빠르게 따라온다 — 훅이 자기 디바운스를 갖는다.
  const suggestions = useSearchSuggestions(query);

  const activeGroup = PRODUCT_CATEGORY_NAV_GROUPS.find((g) => g.key === activeKey) ?? null;
  // 선택된 소분류들 — 비어 있으면 그룹 전체, 여러 개면 OR 매칭(다중 선택).
  const activeSubs = activeGroup?.children?.filter((c) => activeSubKeys.includes(c.key)) ?? [];

  // 서버 categoryId 필터(2026-08-05 실 DB 트리 id 하드코딩, constants/productCategoryGroup.ts) —
  // 검색 중엔 카테고리와 무관하게 전체를 훑는다. **검색어도 서버로 나간다**(2026-08-06, ADR-0019).
  // 디바운스된 값을 쓰는 이유는 이 판단이 곧 요청이기 때문 — 즉시값을 쓰면 첫 글자에서 카테고리
  // 없는 전량 조회가 한 번 나가고 300ms 뒤 검색 조회가 또 나간다.
  // mock 모드는 훅이 ids도 q도 무시하고 전량을 돌려주므로 클라 필터가 그대로 정본이다.
  const categoryIds =
    debouncedQuery.length > 0 || activeGroup === null
      ? null
      : activeSubs.length > 0
        ? [...new Set(activeSubs.flatMap(categoryIdsOf))]
        : categoryIdsOf(activeGroup);
  const { state, isLoadingMore, loadMore } = useCatalogPage(categoryIds, debouncedQuery);
  // 엔진 전역 카탈로그를 구독한다 — 페이지가 도착해도 이게 없으면 아무것도 다시 안 그린다.
  useCatalogVersion();

  const gridItems = [
    { key: DEFAULT_KEY, label: '전체', icon: 'all' as const },
    ...PRODUCT_CATEGORY_NAV_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      icon: g.iconCategory,
    })),
  ];

  const pagedSpecs = state.status === 'loaded' ? state.specs : [];
  const entries: GalleryEntry[] = pagedSpecs.map((spec) => ({ kind: 'local' as const, spec }));
  const serverPaged = state.status === 'loaded' && !mock;
  const hasNext = state.status === 'loaded' && state.hasNext;
  /** ES가 죽었다(503) — 검색만 죽고 카테고리 목록은 산다(ADR-0019 결정 6, 폴백 없음). */
  const searchUnavailable = state.status === 'search-unavailable';

  // real 모드는 서버(Elasticsearch)가 이미 걸러 줬다 — 이름 includes를 겹치면 색인이 잡아낸
  // 제품('모니터암' → '모니터 암' 같은 형태소 매칭, 브랜드 매칭)이 도로 떨어져 나간다.
  // mock만 기존 클라 이름 필터를 탄다(ES를 안 타므로 그게 유일한 정본이다).
  const searchResults = !searching
    ? []
    : mock
      ? entries.filter((e) => e.spec.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
      : entries;

  // real 모드는 서버가 categoryId로 이미 걸러 줬다 — 이름 매칭 클라 필터를 겹치면 라벨과
  // 카테고리명이 다른 제품('머그'≠'컵' 등)이 떨어져 나간다. mock만 기존 클라 필터를 탄다.
  const activeEntries =
    activeGroup === null || !mock
      ? entries
      : entries.filter((e) =>
          activeSubs.length > 0
            ? activeSubs.some((sub) => matchesCategoryFilter(e.spec, sub))
            : matchesCategoryFilter(e.spec, activeGroup),
        );

  return (
    <div className="hud-library" data-testid="hud-library">
      {/* '제품' 제목 줄은 2026-08-05 제거(사용자 요청 "검색바 위의 text 제품 (title) 제거") —
          맨 위가 바로 검색바다. 닫기/접기 버튼도 없다(사용자 확인: "왼쪽 tool bar에는 < 버튼
          없애줘"). 완전히 닫으려면 좌측 레일의 '제품' 아이콘을 다시 누른다. */}
      {/* 추천어 드롭다운은 검색 행을 기준으로 띄운다(.lib-search-wrap이 position:relative) */}
      <div className="lib-search-wrap">
        <div className="lib-search-row">
          <SearchIcon />
          <input
            type="text"
            className="lib-search-input"
            placeholder="제품 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => suggestions.onKeyDown(e, setQuery)}
            // 클릭으로 고르는 중에 닫히면 안 되므로 blur를 한 박자 늦춘다(pointerdown이 먼저 온다).
            onBlur={() => window.setTimeout(suggestions.close, 120)}
            role="combobox"
            aria-expanded={suggestions.items.length > 0}
            aria-controls="library-search-suggestions"
            aria-autocomplete="list"
            data-testid="library-search"
          />
        </div>
        {suggestions.items.length > 0 && (
          <ul
            className="lib-suggest-list"
            id="library-search-suggestions"
            role="listbox"
            data-testid="library-search-suggestions"
          >
            {suggestions.items.map((item, index) => (
              <li key={item}>
                <button
                  type="button"
                  className={
                    index === suggestions.highlighted ? 'lib-suggest-item on' : 'lib-suggest-item'
                  }
                  role="option"
                  aria-selected={index === suggestions.highlighted}
                  onMouseEnter={() => suggestions.highlight(index)}
                  // blur보다 먼저 도는 pointerdown에서 고른다 — click까지 기다리면 위 blur 타이머와
                  // 경합해서 가끔 안 먹는다.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setQuery(item);
                    suggestions.close(item);
                  }}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* 검색 안내 문구(.lib-search-note "불러온 목록에서 검색합니다…")는 2026-08-05 사용자
          요청으로 제거. 2026-08-06부터 검색은 실제로 서버 전량 검색이다(GET /products?q=). */}
      {searching && searchUnavailable ? (
        /* 검색만 죽었다 — 폴백이 없는 것이 결정이므로(ADR-0019 결정 6) 조용히 "결과 없음"으로
           보이면 안 된다. 검색어를 지우면 카테고리 목록은 그대로 산다. */
        <div className="p-3" data-testid="hud-search-unavailable">
          <InlineNotice
            variant="error"
            title="검색을 일시적으로 사용할 수 없습니다"
            message="검색 서버에 문제가 있어 결과를 가져오지 못했습니다. 검색어를 지우면 카테고리에서 제품을 고를 수 있습니다."
          />
        </div>
      ) : searching ? (
        <GallerySection
          key={`search-${debouncedQuery}`}
          entries={searchPending ? [] : searchResults}
          testId="hud-search-results"
          emptyMessage="검색 결과가 없습니다"
          isInitialLoading={state.status === 'loading' || searchPending}
          hasNext={hasNext}
          isLoadingMore={isLoadingMore}
          onLoadMore={serverPaged ? loadMore : undefined}
          showLikeButton
          onLikeChange={(isLiked) => setLikeToast(isLiked ? 'added' : 'removed')}
        />
      ) : activeKey === null ? (
        // 카테고리를 고르기 전엔 목록 화면 자체가 없다 — 그리드만 보인다(2026-08-04).
        <div className="category-grid" data-testid="category-grid">
          {gridItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="category-grid-btn"
              data-testid={`category-${item.key}`}
              onClick={() => {
                setActiveKey(item.key);
                setActiveSubKeys([]);
              }}
            >
              {/* '전체' 타일만 2x2 라인 아이콘 대신 DERO 로고(2026-08-05 사용자 요청
                  "전체 부분에는 dero icon 으로 추가") — 나머지는 카테고리별 3D WebP. */}
              {item.icon === 'all' ? (
                <Image
                  src={DeroLogo}
                  alt=""
                  width={40}
                  height={40}
                  className="category-grid-icon"
                />
              ) : (
                <ProductCategoryIcon
                  category={item.icon}
                  width={40}
                  height={40}
                  className="category-grid-icon"
                />
              )}
              <span className="category-grid-label">{item.label}</span>
            </button>
          ))}
        </div>
      ) : (
        // 카테고리를 고르면 그리드는 사라지고 "카테고리 > 제품목록"으로 들어간다(2026-08-04
        // 사용자 요청) — `lib-breadcrumb-back`이 그리드로 되돌아가는 유일한 통로.
        <>
          <div className="lib-breadcrumb" data-testid="lib-breadcrumb">
            <button
              type="button"
              className="lib-breadcrumb-back"
              data-testid="lib-breadcrumb-back"
              onClick={() => setActiveKey(null)}
            >
              카테고리
            </button>
            <span className="lib-breadcrumb-sep">›</span>
            <span className="lib-breadcrumb-current">
              {gridItems.find((item) => item.key === activeKey)?.label}
            </span>
          </div>
          {/* 소분류 칩 — children이 있는 대분류에서만 태그 행을 그린다(2026-08-05 사용자 요청).
              다중 선택 토글(재클릭 = 그 칩만 해제, 전부 해제되면 그룹 전체로 복귀).
              CSS는 기존 .subcategory-row/.subcategory-chip 재사용. */}
          {activeGroup?.children && (
            <div className="subcategory-row" data-testid="subcategory-row">
              {activeGroup.children.map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  className={
                    activeSubKeys.includes(sub.key) ? 'subcategory-chip active' : 'subcategory-chip'
                  }
                  data-testid={`subcategory-${sub.key}`}
                  onClick={() =>
                    setActiveSubKeys((prev) =>
                      prev.includes(sub.key)
                        ? prev.filter((k) => k !== sub.key)
                        : [...prev, sub.key],
                    )
                  }
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
          <GallerySection
            key={`${activeKey}-${activeSubKeys.join('+') || 'all'}`}
            entries={activeEntries}
            testId="hud-gallery"
            emptyMessage={state.status === 'failed' ? '제품 목록을 불러오지 못했습니다' : undefined}
            isInitialLoading={state.status === 'loading'}
            hasNext={hasNext}
            isLoadingMore={isLoadingMore}
            onLoadMore={serverPaged ? loadMore : undefined}
            showLikeButton
            onLikeChange={(isLiked) => setLikeToast(isLiked ? 'added' : 'removed')}
          />
        </>
      )}

      {likeToast && (
        <Toast
          message={likeToast === 'added' ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.'}
          actionLabel="좋아요 목록 보기"
          actionColorClassName="text-danger-500"
          onAction={() => {
            setLikeToast(null);
            requestSimulatorExitNavigation('/mypage?menu=wishlist');
          }}
          onDismiss={() => setLikeToast(null)}
        />
      )}
    </div>
  );
};

export default LibraryPanel;
