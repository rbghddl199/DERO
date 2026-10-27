'use client';
// 데스크피드 목록 조회를 브라우저에서 수행한다 — 정렬 전환·태그 필터가 둘 다 상태이고, 무한 스크롤
// 커서를 들고 다음 페이지를 이어 붙여야 해서 서버 컴포넌트로는 성립하지 않는다
// (CollectionGalleryLoader와 같은 형태). 목록은 비로그인도 200이다.
//
// 'failed' = 조회 실패, 'loaded' + 빈 배열 = 정상 조회했지만 올라온 사진이 없음 — 뭉개면
// 백엔드가 죽은 것과 "아직 아무도 안 올림"이 화면에서 똑같아진다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listDeskFeeds } from '@/api/deskFeed';
import ErrorState from '@/components/common/ErrorState';
import LoadingState from '@/components/common/LoadingState';
import { DESK_FEED_PAGE_SIZE } from '@/constants/deskFeed';
import { useDeskFeedNavStore } from '@/store/deskFeedNavStore';
import { rankHashtags } from '@/utils/deskFeedChipTags';
import type { DeskFeedSort, DeskFeedSummaryResponse } from '@/types/deskFeed';
import DeskFeedGallery from './DeskFeedGallery';

type LoadState =
  | { status: 'loading' }
  | {
      status: 'loaded';
      posts: DeskFeedSummaryResponse[];
      nextCursor: string | null;
      hasNext: boolean;
      /** 이 목록을 만든 질의 — 커서는 정렬축(`created_at` 또는 `like_count`)과 한 몸이라
       *  다른 질의에 실으면 엉뚱한 페이지가 오거나 디코드가 깨진다. */
      sort: DeskFeedSort;
      tag: string | null;
    }
  | { status: 'failed' };

type Props = {
  /** `?tag=` 쿼리 — 상세의 태그 링크로 들어왔을 때 갤러리를 그 태그로 먼저 필터링한다.
   *  초기값일 뿐이라 이후 칩 조작은 아래 상태가 이긴다. */
  initialTag?: string | null;
};

const DeskFeedGalleryLoader = ({ initialTag = null }: Props) => {
  const [sort, setSort] = useState<DeskFeedSort>('latest');
  /** 선택된 태그 칩 — 서버 필터다(`GET /desk-feeds?hashtag=`). 바뀌면 커서를 버리고 첫 페이지부터 */
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** 칩 줄에 그릴 태그의 **등장 글 수** — **필터가 안 걸린 응답에서만** 모은다. 필터 응답에는 그
   *  태그가 붙은 글만 오므로 거기서 칩을 세우면 한 번 누른 뒤 다른 태그로 갈아탈 수 없다(컬렉션과
   *  같은 규칙). 순서 규칙은 `utils/deskFeedChipTags.ts`. */
  const [chipCounts, setChipCounts] = useState<Map<string, number>>(new Map());
  /** 이미 센 글 — 정렬 전환·재시도로 같은 첫 페이지가 다시 도착하므로 없으면 카운트가 부풀어
   *  칩 순서가 뒤집힌다(옛 Set 방식은 중복 add가 무해해서 필요 없었다). */
  const countedPostIds = useRef<Set<number>>(new Set());
  // 재시도·정렬 전환은 이 토큰을 올려 아래 effect를 다시 태운다 — 핸들러에서 fetch를 직접 부르면
  // 취소 처리를 두 곳에 두게 된다.
  const [reloadToken, setReloadToken] = useState(0);
  const setNavEntries = useDeskFeedNavStore((s) => s.setEntries);

  // 상세의 이전/다음 글 내비게이션 재료 — 갤러리에 그려진 순서를 그대로 세션 스토어에 남긴다.
  useEffect(() => {
    if (state.status === 'loaded') {
      setNavEntries(state.posts.map((post) => ({ id: String(post.id), label: post.title })));
    }
  }, [state, setNavEntries]);

  const collectChipTags = useCallback(
    (posts: DeskFeedSummaryResponse[]) => {
      if (selectedTag !== null) return;
      const fresh = posts.filter((post) => !countedPostIds.current.has(post.id));
      if (fresh.length === 0) return;
      fresh.forEach((post) => countedPostIds.current.add(post.id));
      setChipCounts((current) => {
        const merged = new Map(current);
        fresh.forEach((post) =>
          post.hashtags.forEach((tag) => merged.set(tag, (merged.get(tag) ?? 0) + 1)),
        );
        return merged;
      });
    },
    [selectedTag],
  );

  const chipTags = useMemo(() => rankHashtags(chipCounts), [chipCounts]);

  // setState는 전부 then/catch 콜백 안에서만 부른다 — effect 본문에서 동기로 부르면
  // react-hooks/set-state-in-effect에 걸린다.
  useEffect(() => {
    let cancelled = false;
    listDeskFeeds({
      sort,
      hashtag: selectedTag ?? undefined,
      cursor: null,
      size: DESK_FEED_PAGE_SIZE,
    })
      .then((page) => {
        if (cancelled) return;
        collectChipTags(page.content);
        setState({
          status: 'loaded',
          posts: page.content,
          nextCursor: page.nextCursor,
          hasNext: page.hasNext,
          sort,
          tag: selectedTag,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // 정렬·태그 전환 중 실패해도 기존 갤러리를 유지한다 — 전체를 오류 화면으로 바꾸면 페이지
        // 높이가 줄면서 보던 스크롤 위치가 튄다. 최초 조회 실패만 오류 화면으로 보낸다.
        setState((current) => (current.status === 'loaded' ? current : { status: 'failed' }));
      });
    return () => {
      cancelled = true;
    };
  }, [sort, selectedTag, reloadToken, collectChipTags]);

  const handleLoadMore = useCallback(() => {
    if (state.status !== 'loaded' || !state.hasNext || isLoadingMore) return;
    // 정렬·태그를 바꾼 직후에도 옛 목록이 그려진 채라 감시점이 살아 있다 — 그때 옛 커서를 새
    // 질의에 실으면 정렬축이 어긋난다(latest 커서는 시각, popular 커서는 like_count다).
    // 첫 페이지가 도착해 state가 새 질의로 갈릴 때까지 기다린다.
    if (state.sort !== sort || state.tag !== selectedTag) return;

    const cursor = state.nextCursor;
    setIsLoadingMore(true);
    listDeskFeeds({
      sort,
      hashtag: selectedTag ?? undefined,
      cursor,
      size: DESK_FEED_PAGE_SIZE,
    })
      .then((page) => {
        collectChipTags(page.content);
        setState((current) =>
          // 그 사이 정렬·태그가 바뀌었으면 이 페이지는 다른 질의의 조각이라 버린다.
          current.status === 'loaded' && current.nextCursor === cursor
            ? {
                status: 'loaded',
                posts: [...current.posts, ...page.content],
                nextCursor: page.nextCursor,
                hasNext: page.hasNext,
                sort: current.sort,
                tag: current.tag,
              }
            : current,
        );
        setIsLoadingMore(false);
      })
      .catch(() => {
        // 다음 페이지 실패로 이미 보고 있는 목록을 지우지 않는다 — 감시점이 다시 보이면 재시도된다.
        setIsLoadingMore(false);
      });
  }, [state, sort, selectedTag, isLoadingMore, collectChipTags]);

  if (state.status === 'loading') {
    return (
      <LoadingState
        label="데스크피드를 불러오는 중"
        description="사람들이 올린 책상 사진을 가져오고 있습니다."
      />
    );
  }

  if (state.status === 'failed') {
    return (
      <ErrorState
        title="데스크피드를 불러오지 못했습니다"
        description="백엔드 서버가 실행 중인지 확인한 뒤 다시 시도해주세요."
        retryLabel="다시 시도"
        onRetry={() => {
          setState({ status: 'loading' });
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  return (
    <DeskFeedGallery
      posts={state.posts}
      sort={sort}
      onSortChange={setSort}
      tags={chipTags}
      selectedTag={selectedTag}
      onTagChange={setSelectedTag}
      hasNext={state.hasNext}
      isLoadingMore={isLoadingMore}
      onLoadMore={handleLoadMore}
    />
  );
};

export default DeskFeedGalleryLoader;
