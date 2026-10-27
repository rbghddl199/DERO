'use client';
// 커뮤니티 목록 — 다른 사람이 올린 데스크테리어 글을 둘러보는 화면. 실제 `GET /posts`(커서 페이지네이션)를
// 치고 '더 보기'로 다음 페이지를 이어 붙인다. **검색(제목·본문·태그·작성자)은 서버가 한다**
// (2026-08-07, DERO-492 · ADR-0027) — `?q=`로 나가고 결과는 관련도 순서다. 받아 온 페이지
// 안에서만 이름을 includes로 거르던 클라 필터는 페이징 너머를 못 찾아서 걷어냈다.
// 확정 버튼이 없는 입력창이라 300ms 디바운스한다(LibraryPanel과 같은 이유 — 타이핑마다 요청이 나간다).

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/api/client';
import InlineNotice from '@/components/common/InlineNotice';
import Toast from '@/components/common/Toast';
import SortDropdown from '@/components/common/SortDropdown';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useCommunityBookmarksStore } from '@/store/communityBookmarksStore';
import { useCommunityLikesStore } from '@/store/communityLikesStore';
import { getCommunityPostPage } from '@/api/community';
import { deletePostLike, putPostLike } from '@/api/interaction';
import { POST_PAGE_SIZE } from '@/constants/post';
import { normalizeSearchQuery } from '@/utils/searchQuery';
import type { CommunityPost } from './types';
import PostCard from './PostCard';

type Props = {
  /** '좋아요 목록 보기' 토스트 액션으로만 들어오는 숨은 필터 — 화면 안에 노출된 탭은 없다 */
  initialViewMode: string | null;
  /** 카드나 상세의 태그를 눌러 들어온 경우 서버의 완전 일치 태그 필터로 조회한다. */
  initialTag: string | null;
};

/** 'search-unavailable' = ES만 죽었다(503) — 목록 전체 실패와 화면 문구가 달라야 한다. */
type ListState = 'loading' | 'ready' | 'error' | 'search-unavailable';
type CommunitySort = 'latest' | 'popular' | 'oldest';

/** 검색 입력 확정을 늦추는 시간(ms) — 확정 버튼이 없어 타이핑마다 서버로 나간다. */
const SEARCH_DEBOUNCE_MS = 300;

const COMMUNITY_SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '인기순' },
  { value: 'oldest', label: '오래된순' },
];

const CommunityGallery = ({ initialViewMode, initialTag }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [listState, setListState] = useState<ListState>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const bookmarkOverrides = useCommunityBookmarksStore((s) => s.overrides);
  const toggleBookmarkStore = useCommunityBookmarksStore((s) => s.toggle);
  const likeOverrides = useCommunityLikesStore((s) => s.overrides);
  const toggleLikeStore = useCommunityLikesStore((s) => s.toggle);
  const [searchQuery, setSearchQuery] = useState(initialTag ? `#${initialTag}` : '');
  /** 서버로 나가는 질의 — '#'은 여기서만 뗀다(utils/searchQuery.ts). */
  const [debouncedQuery, setDebouncedQuery] = useState(initialTag ?? '');
  const [sort, setSort] = useState<CommunitySort>('latest');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const isLikedView = initialViewMode === 'liked';
  const [toast, setToast] = useState<{
    kind: 'bookmark' | 'like';
    action: 'added' | 'removed';
  } | null>(null);

  // 오버라이드가 있으면 그걸 쓰고, 카운트는 "내가 바꾼 만큼"(원래 상태 대비 +1/-1)만 반영한다 —
  // Math.max(0, ...)로 클램프해 0 미만으로는 절대 안 내려간다.
  const effectivePosts = useMemo(
    () =>
      posts.map((post) => {
        const isBookmarked = bookmarkOverrides.get(post.id) ?? post.isBookmarked;
        const bookmarkCount = Math.max(
          0,
          post.bookmarkCount + (Number(isBookmarked) - Number(post.isBookmarked)),
        );
        const isLiked = likeOverrides.get(post.id) ?? post.isLiked;
        const likeCount = Math.max(0, post.likeCount + (Number(isLiked) - Number(post.isLiked)));
        return { ...post, isBookmarked, bookmarkCount, isLiked, likeCount };
      }),
    [posts, bookmarkOverrides, likeOverrides],
  );

  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedQuery(normalizeSearchQuery(searchQuery)),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    getCommunityPostPage({
      size: POST_PAGE_SIZE,
      hashtag: initialTag ?? undefined,
      q: debouncedQuery,
    })
      .then((page) => {
        if (cancelled) return;
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
        setHasNext(page.hasNext);
        setListState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // 검색 요청만 골라 죽는 503 — 폴백이 없으므로(ADR-0019 결정 6) "글이 없다"로 보이면 안 된다.
        setListState(
          error instanceof ApiError &&
            error.status === 503 &&
            error.problem?.code === 'POST_SEARCH_UNAVAILABLE'
            ? 'search-unavailable'
            : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [initialTag, debouncedQuery]);

  const handleLoadMore = async (): Promise<void> => {
    if (nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await getCommunityPostPage({
        cursor: nextCursor,
        size: POST_PAGE_SIZE,
        hashtag: initialTag ?? undefined,
        q: debouncedQuery,
      });
      setPosts((prev) => [...prev, ...page.posts]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch (error) {
      console.error('[CommunityGallery] 글을 더 불러오지 못했습니다', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const visiblePosts = useMemo(() => {
    // 검색은 서버가 이미 걸러 줬다 — 이름 includes를 겹치면 색인이 잡아낸 글(형태소 매칭, 작성자
    // 매칭)이 도로 떨어져 나간다. 여기 남는 건 '좋아요한 글' 보기 필터뿐이다.
    const filteredPosts = effectivePosts.filter((post) => !isLikedView || post.isLiked);

    return filteredPosts.toSorted((a, b) => {
      const newestFirst = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (sort === 'popular') return b.likeCount - a.likeCount || newestFirst;
      return sort === 'oldest' ? -newestFirst : newestFirst;
    });
  }, [effectivePosts, isLikedView, sort]);

  // 로그인 게이트는 개발 중 한시적으로 비활성화한다(2026-07-30 사용자 확인) — 백엔드 인증 붙으면 되돌릴 것
  const handleWriteClick = () => {
    router.push('/community/new');
  };

  const handleToggleBookmark = (id: string) => {
    if (!requireAuth()) return;
    const target = posts.find((post) => post.id === id);
    const willBookmark = toggleBookmarkStore(id, target?.isBookmarked ?? false);
    setToast({ kind: 'bookmark', action: willBookmark ? 'added' : 'removed' });
  };

  // 목록 응답엔 per-user `liked`가 없어 하트 상태는 로컬 오버라이드가 정본이고, 서버에는 같은 값을
  // 그대로 반영한다(토글은 멱등 204). 상세 화면은 GET /posts/{id}/like로 서버 값을 다시 확정한다.
  const handleToggleLike = (id: string) => {
    if (!requireAuth()) return;
    const target = posts.find((post) => post.id === id);
    const willLike = toggleLikeStore(id, target?.isLiked ?? false);
    setToast({ kind: 'like', action: willLike ? 'added' : 'removed' });
    const request = willLike ? putPostLike(Number(id)) : deletePostLike(Number(id));
    request.catch((error: unknown) => {
      console.error('[CommunityGallery] 좋아요를 반영하지 못했습니다', error);
    });
  };

  return (
    <div className="font-swiss tracking-[-0.03em]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary-700 mb-2 text-[13px] font-medium tabular-nums">
            자유롭게 소통하세요
          </p>
          <h1 className="text-ink text-[32px] leading-[1.2] font-medium">커뮤니티</h1>
        </div>
      </div>

      <div className="border-ash/20 my-8 border-t" />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[520px]">
          <SortDropdown
            options={COMMUNITY_SORT_OPTIONS}
            value={sort}
            onChange={(value) => setSort(value as CommunitySort)}
            buttonClassName="h-[46px] px-5 text-[15px]"
          />
          <label className="border-ash/40 bg-paper focus-within:border-ink flex min-w-0 flex-1 items-center gap-2 rounded-full border px-4 py-2.5 transition-colors">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="text-ash shrink-0"
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M11 11 14.5 14.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="#원목데스크, 모니터암 검색"
              className="text-ink placeholder:text-ash w-full min-w-0 text-[15px] outline-none"
            />
          </label>
        </div>

        {/* 작성하기 + 그리드/리스트 토글을 한 묶음으로 붙인다 — 검색창과의 간격(gap-3)보다
            둘 사이 간격(gap-1.5)을 좁혀 "나란히"로 보이게 한다 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleWriteClick}
            className="bg-ink text-paper shrink-0 cursor-pointer rounded-full px-5 py-2.5 text-[15px] font-medium transition-opacity hover:opacity-90"
          >
            커뮤니티 글 작성하기
          </button>

          {/* 그리드/리스트 레이아웃 토글 — 트랙 안 pill이 슬라이드하는 세그먼트 컨트롤, 아이콘만 표기 */}
          <div className="bg-fog shrink-0 rounded-full p-1">
            <div className="flex">
              <button
                type="button"
                onClick={() => setLayout('grid')}
                aria-pressed={layout === 'grid'}
                aria-label="그리드로 보기"
                className={`flex cursor-pointer items-center justify-center rounded-full p-1.5 transition-colors ${
                  layout === 'grid' ? 'bg-paper text-ink' : 'text-ash'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect
                    x="2"
                    y="2"
                    width="5"
                    height="5"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <rect
                    x="9"
                    y="2"
                    width="5"
                    height="5"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <rect
                    x="2"
                    y="9"
                    width="5"
                    height="5"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <rect
                    x="9"
                    y="9"
                    width="5"
                    height="5"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setLayout('list')}
                aria-pressed={layout === 'list'}
                aria-label="리스트로 보기"
                className={`flex cursor-pointer items-center justify-center rounded-full p-1.5 transition-colors ${
                  layout === 'list' ? 'bg-paper text-ink' : 'text-ash'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect
                    x="2"
                    y="3"
                    width="12"
                    height="3"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <rect
                    x="2"
                    y="10"
                    width="12"
                    height="3"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLikedView && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-ash text-[14px]">보기</span>
          <button
            type="button"
            onClick={() => router.push('/community')}
            className="bg-danger-500 text-paper flex items-center gap-1.5 rounded-[10px] px-3 py-1 text-[14px]"
          >
            좋아요한 데스크테리어
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      {listState === 'loading' && (
        <p className="text-ash py-16 text-center text-[16px]">글을 불러오는 중...</p>
      )}

      {listState === 'error' && (
        <p className="text-ash py-16 text-center text-[16px]">
          글을 불러올 수 없어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {/* 검색만 죽었다 — 폴백이 없는 것이 결정이므로(ADR-0019 결정 6) 조용히 "결과 없음"으로
          보이면 안 된다. 검색어를 지우면 목록은 그대로 산다. */}
      {listState === 'search-unavailable' && (
        <div data-testid="community-search-unavailable">
          <InlineNotice
            variant="error"
            title="검색을 일시적으로 사용할 수 없습니다"
            message="검색 서버에 문제가 있어 결과를 가져오지 못했습니다. 검색어를 지우면 전체 글 목록을 볼 수 있습니다."
          />
        </div>
      )}

      {listState === 'ready' &&
        (visiblePosts.length === 0 ? (
          <p className="text-ash py-16 text-center text-[16px]">
            {isLikedView ? '아직 좋아요한 데스크테리어가 없어요.' : '조건에 맞는 글이 없어요.'}
          </p>
        ) : (
          <div
            className={
              // CSS columns(매스너리)는 칼럼 단위로 위→아래로 채우므로 12개·3칼럼이면 1~4번이 왼쪽
              // 칼럼에 세로로 쌓인다 — 최신 글이 좌→우 순서로 읽히지 않는다. 목록은 최신순 좌→우
              // 읽기 순서가 우선이라 행 단위로 채우는 CSS grid로 되돌린다 (2026-08-03 사용자 지시).
              layout === 'grid'
                ? 'grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex flex-col gap-1'
            }
          >
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onToggleBookmark={handleToggleBookmark}
                onToggleLike={handleToggleLike}
                layout={layout}
              />
            ))}
          </div>
        ))}

      {listState === 'ready' && hasNext && (
        <button
          type="button"
          disabled={isLoadingMore}
          onClick={() => void handleLoadMore()}
          className="border-ash/40 text-ink hover:bg-fog mt-8 w-full cursor-pointer rounded-[10px] border py-3 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingMore ? '불러오는 중...' : '글 더 보기'}
        </button>
      )}

      {toast &&
        (toast.kind === 'bookmark' ? (
          <Toast
            message={
              toast.action === 'added' ? '북마크에 저장되었습니다.' : '북마크가 취소되었습니다.'
            }
            onDismiss={() => setToast(null)}
          />
        ) : (
          <Toast
            message={
              toast.action === 'added' ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.'
            }
            actionLabel="좋아요 목록 보기"
            actionColorClassName="text-danger-500"
            onAction={() => {
              setToast(null);
              router.push('/community?view=liked');
            }}
            onDismiss={() => setToast(null)}
          />
        ))}
    </div>
  );
};

export default CommunityGallery;
