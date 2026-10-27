'use client';
// 컬렉션 목록 조회를 브라우저에서 수행한다 — 정렬 전환과 무한 스크롤이 둘 다 상태이고, 커서를
// 들고 다음 페이지를 이어 붙여야 해서 서버 컴포넌트로는 성립하지 않는다.
//
// 컬렉션는 publishStatus=PUBLIC만 보여주므로 비로그인도 그대로 200이다 — 로그아웃 상태에서 이 화면이
// 401로 깨지지 않는다(가시성 정본은 백엔드, api/collection.ts 주석 참고).
//
// 'failed' = 조회 실패, 'loaded' + 빈 배열 = 정상 조회했지만 공개 배치가 없음. 뭉개면 백엔드가 죽은
// 것과 "아직 아무도 안 올림"이 화면에서 똑같아진다(CraftDeskCollectionLoader와 같은 구분).

import { useCallback, useEffect, useState } from 'react';

import { getCollectionPage } from '@/api/collection';
import { ApiError } from '@/api/client';
import LoadingState from '@/components/common/LoadingState';
import { normalizeSearchQuery } from '@/utils/searchQuery';
import type { PlacementSort } from '@/types/placement';
import CollectionGallery from './CollectionGallery';
import CollectionLoadErrorState from './CollectionLoadErrorState';
import type { CollectionPost } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; posts: CollectionPost[]; nextCursor: string | null; hasNext: boolean }
  | { status: 'failed' };

type Props = {
  /** `?tag=` 쿼리 — 상세 페이지의 태그 링크로 들어왔을 때 갤러리를 그 태그로 먼저 필터링한다.
   *  초기값일 뿐이라 이후 칩 조작은 아래 상태가 이긴다. */
  initialTag?: string | null;
};

const CollectionGalleryLoader = ({ initialTag = null }: Props) => {
  const [sort, setSort] = useState<PlacementSort>('latest');
  /** 선택된 태그 칩 — 서버 필터다(`GET /placements?hashtag=`, DERO-493). 검색어와 같은 이유로
   *  여기 산다: 바뀌면 커서를 버리고 첫 페이지부터 다시 받아야 한다. */
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** 확정된 검색어(갤러리 검색 폼의 submit) — 서버 질의다(`GET /placements?q=`). */
  const [searchQuery, setSearchQuery] = useState('');
  /** 검색만 죽었다(503) — 목록 상태와 갈라 둔다. 폴백은 없다(ADR-0019 결정 6). */
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  /** 칩 줄에 그릴 태그 — **필터가 안 걸린 응답에서만** 모은다. 필터 응답에는 그 태그가 붙은 배치만
   *  오므로 거기서 칩을 세우면 한 번 누른 뒤 다른 태그로 갈아탈 수 없다. 무한 스크롤로 페이지가
   *  붙을 때마다 늘어난다. */
  const [chipTags, setChipTags] = useState<string[]>([]);
  // 재시도·정렬 전환은 이 토큰을 올려 아래 effect를 다시 태운다 — 핸들러에서 fetch를 직접 부르면
  // 취소 처리를 두 곳에 두게 된다(CraftDeskCollectionLoader와 같은 형태).
  const [reloadToken, setReloadToken] = useState(0);

  // setState는 전부 then/catch 콜백 안에서만 부른다 — effect 본문에서 동기로 부르면
  // react-hooks/set-state-in-effect에 걸린다.
  // 필터 없는 응답에서만 칩을 모은다 — 위 chipTags 주석 참고.
  const collectChipTags = useCallback(
    (posts: CollectionPost[]) => {
      if (selectedTag !== null) return;
      setChipTags((current) => {
        const merged = new Set(current);
        posts.forEach((post) => post.tags.forEach((tag) => merged.add(tag)));
        return merged.size === current.length
          ? current
          : Array.from(merged).sort((a, b) => a.localeCompare(b, 'ko'));
      });
    },
    [selectedTag],
  );

  useEffect(() => {
    let cancelled = false;
    getCollectionPage(sort, null, searchQuery, selectedTag)
      .then((page) => {
        if (cancelled) return;
        setSearchUnavailable(false);
        collectChipTags(page.posts);
        setState({
          status: 'loaded',
          posts: page.posts,
          nextCursor: page.nextCursor,
          hasNext: page.hasNext,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // 검색 요청만 골라 죽는 503 — 목록은 그대로 두고 배너만 띄운다. 조용히 "결과 없음"으로
        // 보이면 안 된다(ADR-0019 결정 6, 폴백 없음). 검색어는 갤러리가 그려진 뒤에만 생기므로
        // 여기 오는 시점의 state는 항상 loaded다.
        if (
          error instanceof ApiError &&
          error.status === 503 &&
          error.problem?.code === 'PLACEMENT_SEARCH_UNAVAILABLE'
        ) {
          console.error('[CollectionGalleryLoader] 검색 서버를 사용할 수 없습니다', error);
          setSearchUnavailable(true);
          return;
        }
        // 정렬 변경 중 실패해도 기존 갤러리를 유지한다 — 전체를 오류 화면으로 바꾸면 페이지 높이가
        // 줄면서 사용자가 보던 스크롤 위치가 위로 튄다. 최초 조회 실패만 오류 화면으로 보낸다.
        setState((current) => (current.status === 'loaded' ? current : { status: 'failed' }));
      });
    return () => {
      cancelled = true;
    };
  }, [sort, searchQuery, selectedTag, reloadToken, collectChipTags]);

  const handleLoadMore = useCallback(() => {
    if (state.status !== 'loaded' || !state.hasNext || isLoadingMore) return;

    const cursor = state.nextCursor;
    setIsLoadingMore(true);
    getCollectionPage(sort, cursor, searchQuery, selectedTag)
      .then((page) => {
        collectChipTags(page.posts);
        setState((current) =>
          // 그 사이 정렬이 바뀌었으면 이 페이지는 다른 정렬의 조각이라 버린다 — 이어 붙이면 두 정렬이
          // 섞인 목록이 된다.
          current.status === 'loaded' && current.nextCursor === cursor
            ? {
                status: 'loaded',
                posts: [...current.posts, ...page.posts],
                nextCursor: page.nextCursor,
                hasNext: page.hasNext,
              }
            : current,
        );
        setIsLoadingMore(false);
      })
      .catch(() => {
        // 다음 페이지 실패로 이미 보고 있는 목록을 지우지 않는다 — 감시점이 다시 보이면 재시도된다.
        setIsLoadingMore(false);
      });
  }, [state, sort, searchQuery, selectedTag, isLoadingMore, collectChipTags]);

  const handleSortChange = (next: PlacementSort) => {
    if (next === sort) return;
    setSort(next);
    // 기존 목록을 그대로 둔 채 새 정렬 응답으로 교체한다. 로딩 화면으로 바꾸면 문서 높이가 순간적으로
    // 줄어 브라우저가 scrollY를 강제로 보정하므로 정렬 탭을 누를 때 화면이 위로 올라간다.
  };

  if (state.status === 'loading') {
    return (
      <LoadingState
        label="데스크테리어를 불러오는 중"
        description="사람들이 올린 데스크테리어를 가져오고 있습니다."
      />
    );
  }

  if (state.status === 'failed') {
    return (
      <CollectionLoadErrorState
        onRetry={() => {
          setState({ status: 'loading' });
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  return (
    <CollectionGallery
      posts={state.posts}
      sort={sort}
      onSortChange={handleSortChange}
      hasNext={state.hasNext}
      isLoadingMore={isLoadingMore}
      onLoadMore={handleLoadMore}
      tags={chipTags}
      selectedTag={selectedTag}
      onTagChange={setSelectedTag}
      onSearch={(query) => setSearchQuery(normalizeSearchQuery(query))}
      searchUnavailable={searchUnavailable}
    />
  );
};

export default CollectionGalleryLoader;
