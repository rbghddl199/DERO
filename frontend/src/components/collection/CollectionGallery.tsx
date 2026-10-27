'use client';
// 컬렉션 목록 — 핀터레스트풍 매스너리 갤러리(카드마다 높이가 다르게 흐른다).
// 커뮤니티 CommunityGallery(균일 그리드 + 그리드/리스트 토글)와는 다른 별개 레이아웃이다.
//
// **매스너리는 CSS columns가 아니라 고정 칼럼 컨테이너 + 인덱스 라운드로빈 분배다**(2026-08-06
// 사용자 리포트로 교체). CSS columns는 항목을 위→아래로 채우고 남는 만큼 다음 칼럼으로 넘기는
// 방식이라, 무한 스크롤이 다음 페이지를 이어 붙일 때마다 **전체를 다시 분배**한다 — 보고 있던
// 카드가 스크롤 중 다른 칼럼으로 점프했다. 지금 방식은 `visiblePosts[i]`가 항상 `i % 칼럼수`
// 칼럼에 들어가므로, 뒤에 항목이 붙어도 앞 항목의 자리는 절대 안 바뀐다(칼럼 수·필터가 바뀔
// 때만 전체 재배치 — 그건 의도된 동작). 칼럼 수는 Tailwind sm/lg 브레이크포인트(640/1024)와
// 동일하게 뷰포트 폭에서 구한다.
// posts는 CollectionGalleryLoader(클라이언트)가 `GET /placements`로 받아 페이지 단위로 누적해 내려준다
// — 정렬(최신/인기)·다음 페이지·**검색**을 전부 서버가 한다(2026-08-07, DERO-492).
// 검색어는 submit할 때 로더로 올라가 `?q=`로 나가고, 결과는 관련도 순서다(ADR-0027) — 받아 온
// 페이지 안에서 이름을 includes로 거르던 클라 필터는 페이징 너머를 못 찾아서 걷어냈다.
// **태그 칩도 2026-08-07부터 서버다**(DERO-493) — 칩을 누르면 로더가 `?hashtag=`로 다시
// 조회한다. 칩에 그리는 태그는 목록 응답의 실제 값이고, 화면 연출용 데모 태그(collectionDemoTags.ts)는
// 지웠다. **칩 목록은 로더가 준다**(`tags` prop): 필터가 걸린 응답에는 그 태그가 붙은 배치만 오므로
// 화면에 있는 글에서 칩을 세우면 한 번 누른 순간 칩 줄이 줄어 다른 태그로 갈아탈 수 없다.
//
// 북마크는 2026-08-02부터 서버 진실이다(DERO-343) — 목록 응답의 isBookmarked를 그대로 그리고
// 토글은 실제 PUT/DELETE다. pendingBookmarks는 요청이 도는 동안 화면을 앞서 바꾸는 낙관적 오버레이일
// 뿐이고 실패하면 되돌린다 — 저장되지 않는다(종전 collectionBookmarksStore(persist)와 다른 점).
// 카드엔 그룹 선택 UI가 없으므로 담을 때 **본문 없는 PUT**을 쓴다: 그래야 이미 그룹에 담긴 북마크가
// '그룹 없음'으로 조용히 옮겨지지 않는다.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import InlineNotice from '@/components/common/InlineNotice';
import Toast from '@/components/common/Toast';
import { deletePlacementBookmark, putPlacementBookmarkKeepingGroup } from '@/api/interaction';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import type { PlacementSort } from '@/types/placement';
import type { CollectionPost } from './types';
import CollectionCard from './CollectionCard';
import CollectionPopularBanner from './CollectionPopularBanner';

// 배너에 우선 노출할 고정 글 — 싸버지의 데스크테리어(/collection/1652). 목록(첫 페이지)에
// 없으면 종전대로 likeCount 최다 글로 돌아간다.
const FEATURED_POST_ID = '1652';

const SORT_TABS: { value: PlacementSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '인기순' },
];

// 매스너리 칼럼 수 — Tailwind sm(640)/lg(1024) 브레이크포인트와 동일한 기준.
// useSyncExternalStore 구독쌍이라 매 렌더 새 함수를 만들지 않게 모듈 스코프에 둔다.
// 서버 스냅샷은 3(데스크톱 기본) — 이 컴포넌트는 로더가 클라이언트 fetch를 끝낸 뒤에만
// 마운트되므로 실제로 SSR되진 않지만, useSyncExternalStore가 형식상 요구한다.
const subscribeViewport = (onChange: () => void): (() => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const getColumnCount = (): number =>
  window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
const getServerColumnCount = (): number => 3;

type Props = {
  posts: CollectionPost[];
  sort: PlacementSort;
  onSortChange: (sort: PlacementSort) => void;
  hasNext: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** 칩 줄에 그릴 태그들 — 로더가 필터 없는 응답에서 모아 둔 값이다(필터 응답은 편향된다). */
  tags: string[];
  /** 선택된 태그 칩. 로더가 들고 있다 — 바뀌면 첫 커서부터 다시 조회해야 한다. */
  selectedTag: string | null;
  /** 칩 클릭 — 로더가 `?hashtag=`로 바꿔 다시 조회한다. `null`이면 '전체'다. */
  onTagChange: (tag: string | null) => void;
  /** 검색 폼 submit — 로더가 서버 질의(`?q=`)로 바꿔 다시 조회한다. */
  onSearch: (query: string) => void;
  /** 검색만 503으로 죽었다 — 결과 대신 배너를 그린다(폴백 없음, ADR-0019 결정 6). */
  searchUnavailable: boolean;
};

const CollectionGallery = ({
  posts,
  sort,
  onSortChange,
  hasNext,
  isLoadingMore,
  onLoadMore,
  tags,
  selectedTag,
  onTagChange,
  onSearch,
  searchUnavailable,
}: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const [searchDraft, setSearchDraft] = useState('');
  /** 토글 요청이 도는 동안만 서버 값을 앞서 덮는 낙관적 오버레이 — 실패하면 항목을 지워 되돌린다. */
  const [pendingBookmarks, setPendingBookmarks] = useState<ReadonlyMap<string, boolean>>(new Map());
  /** '제품' 좋아요 토스트(ProductGrid.tsx)와 같은 연출 — 북마크 추가/해제·실패를 하단 토스트로 알린다 */
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const effectivePosts = useMemo(
    () =>
      posts.map((post) => ({
        ...post,
        isBookmarked: pendingBookmarks.get(post.id) ?? post.isBookmarked,
      })),
    [posts, pendingBookmarks],
  );

  // reduce에 초기값이 없어 빈 배열이면 던진다 — 목록이 실제 API가 되면서 "공개 배치 0건"이 정상
  // 상태가 됐으므로 먼저 걸러야 한다. 고정 글(FEATURED_POST_ID)이 목록에 있으면 그 글을 우선한다.
  const popularPost = useMemo(() => {
    if (effectivePosts.length === 0) return null;
    const featured = effectivePosts.find((post) => post.id === FEATURED_POST_ID);
    if (featured !== undefined) return featured;
    return effectivePosts.reduce((top, post) => (post.likeCount > top.likeCount ? post : top));
  }, [effectivePosts]);

  // 선택된 태그는 칩 줄에 항상 있어야 한다 — `?tag=`로 바로 들어온 경우 로더가 아직 그 태그를
  // 본 적이 없어 목록에 없고, 그러면 무엇이 걸려 있는지 화면에 안 보인다.
  const allTags = useMemo(
    () => (selectedTag === null || tags.includes(selectedTag) ? tags : [selectedTag, ...tags]),
    [tags, selectedTag],
  );

  // 검색도 태그도 서버가 이미 걸렀다 — 여기서 한 번 더 거르면 색인이 잡아낸 글(형태소 매칭, 작성자
  // 매칭)이 도로 떨어져 나간다.
  const visiblePosts = effectivePosts;

  // 인덱스 라운드로빈 분배 — visiblePosts 앞부분이 그대로면(무한 스크롤 append) 기존 카드의
  // 칼럼·순서도 그대로다. 파일 상단 주석 참고.
  const columnCount = useSyncExternalStore(subscribeViewport, getColumnCount, getServerColumnCount);
  const postColumns = useMemo(() => {
    const columns: CollectionPost[][] = Array.from({ length: columnCount }, () => []);
    visiblePosts.forEach((post, index) => {
      columns[index % columnCount].push(post);
    });
    return columns;
  }, [visiblePosts, columnCount]);

  // 감시점이 화면에 들어오면 다음 페이지를 당긴다. onLoadMore는 로더가 중복 호출을 막는다
  // (isLoadingMore 가드) — 관찰자 콜백은 스크롤 중 여러 번 불릴 수 있다.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || !hasNext) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, onLoadMore]);

  // 낙관적으로 먼저 바꾸고 실패하면 그 항목만 지워 서버 값으로 되돌린다. 담을 때는 본문 없는 PUT이라
  // 이미 배정된 그룹이 풀리지 않는다(그룹 이동은 상세의 BookmarkGroupPicker가 한다).
  const handleToggleBookmark = (id: string) => {
    if (!requireAuth()) return;
    const target = effectivePosts.find((post) => post.id === id);
    if (target === undefined) return;

    const next = !target.isBookmarked;
    setPendingBookmarks((current) => new Map(current).set(id, next));
    setToastMessage(next ? '북마크에 추가되었습니다.' : '북마크를 해제했습니다.');

    const request = next
      ? putPlacementBookmarkKeepingGroup(target.placementId)
      : deletePlacementBookmark(target.placementId);

    request.catch((error: unknown) => {
      console.error('[CollectionGallery] 북마크 처리에 실패했습니다', error);
      setPendingBookmarks((current) => {
        const rolledBack = new Map(current);
        rolledBack.delete(id);
        return rolledBack;
      });
      setToastMessage('북마크를 처리하지 못했어요. 다시 시도해주세요.');
    });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(searchDraft);
  };

  const handleSelectTag = (tag: string) => {
    onTagChange(selectedTag === tag ? null : tag);
  };

  return (
    <div className="font-swiss tracking-[-0.03em]">
      {popularPost !== null && (
        <CollectionPopularBanner
          post={popularPost}
          badge={popularPost.id === FEATURED_POST_ID ? '싸버지의 데스크테리어' : undefined}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary-700 mb-2 text-[13px] font-medium tabular-nums">컬렉션</p>
          <h1 className="text-ink text-[32px] leading-[1.2] font-medium">
            데스크테리어
            <br />
            구경하고 가세요!
          </h1>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <form
            onSubmit={handleSearchSubmit}
            className="border-ash/40 bg-paper focus-within:border-ink flex w-full items-center gap-2 rounded-full border px-4 py-2.5 transition-colors sm:w-[280px]"
          >
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="#원목데스크, 게이밍 검색"
              className="text-ink placeholder:text-ash w-full min-w-0 text-[15px] outline-none"
            />
            <button
              type="submit"
              aria-label="검색"
              className="text-ash hover:text-ink shrink-0 cursor-pointer"
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
          </form>

          {/* 게시 입구는 작업실이다(D33·ADR-0036) — 여기선 그 자리로 안내만 한다.
              `/collection/new`는 없어졌다: 입구가 둘이면 제목·설명이 경로마다 다르게 저장된다. */}
          <button
            type="button"
            onClick={() => router.push('/craft')}
            className="bg-ink text-paper shrink-0 cursor-pointer rounded-3xl px-5 py-2.5 text-[15px] font-medium transition-opacity hover:opacity-90"
          >
            데스크 올리기
          </button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTagChange(null)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              selectedTag === null
                ? 'bg-ink border-ink text-paper'
                : 'border-ash/40 text-ash hover:border-ink hover:text-ink'
            }`}
          >
            전체
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleSelectTag(tag)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                selectedTag === tag
                  ? 'bg-ink border-ink text-paper'
                  : 'border-ash/40 text-ash hover:border-ink hover:text-ink'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* 정렬 전환 — 페이지 번호 UI는 두지 않는다(커서 페이지네이션, ADR-0008 결정 5). */}
      <div className="mt-6 flex gap-2">
        {SORT_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onSortChange(tab.value)}
            aria-pressed={sort === tab.value}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-[14px] font-medium transition-colors ${
              sort === tab.value
                ? 'bg-ink border-ink text-paper'
                : 'border-ash/40 text-ash hover:border-ink hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="border-ash/20 my-8 border-t" />

      <p className="text-ash mb-6 text-[13px]">아래 사진은 모두 AI로 생성되었습니다.</p>

      {searchUnavailable ? (
        /* 검색만 죽었다 — 폴백이 없는 것이 결정이므로(ADR-0019 결정 6) 조용히 "결과 없음"으로
           보이면 안 된다. 검색어를 지우고 다시 검색하면 목록은 그대로 산다. */
        <div data-testid="collection-search-unavailable">
          <InlineNotice
            variant="error"
            title="검색을 일시적으로 사용할 수 없습니다"
            message="검색 서버에 문제가 있어 결과를 가져오지 못했습니다. 검색어를 지우고 다시 검색하면 전체 목록을 볼 수 있습니다."
          />
        </div>
      ) : visiblePosts.length === 0 ? (
        <p className="text-ash py-16 text-center text-[16px]">조건에 맞는 데스크테리어가 없어요.</p>
      ) : (
        <div className="flex gap-1">
          {postColumns.map((columnPosts, columnIndex) => (
            <div key={columnIndex} className="min-w-0 flex-1">
              {columnPosts.map((post) => (
                <CollectionCard key={post.id} post={post} onToggleBookmark={handleToggleBookmark} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 무한 스크롤 감시점. 화면에 들어오면 다음 페이지를 요청한다 — 뷰포트보다 200px 먼저 당긴다.
          검색이 죽었을 땐 감시점을 아예 안 그린다: 배너만 남아 문서가 짧아지므로 감시점이 계속
          보이고, 같은 503 요청이 반복해서 나간다. */}
      {hasNext && !searchUnavailable && (
        <div ref={sentinelRef} className="py-10 text-center">
          <p className="text-ash text-[14px]">{isLoadingMore ? '불러오는 중…' : ' '}</p>
        </div>
      )}

      {toastMessage !== null && (
        <Toast
          message={toastMessage}
          actionLabel="북마크 보기"
          onAction={() => {
            setToastMessage(null);
            router.push('/mypage?menu=bookmark');
          }}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  );
};

export default CollectionGallery;
