'use client';
// 데스크피드 목록 — 실사진 매스너리 갤러리. CollectionGallery와 같은 레이아웃 규칙을 따르되
// 별개 도메인이라 컴포넌트를 공유하지 않는다(컬렉션·커뮤니티에서 import 금지 — 복사만).
//
// **매스너리는 CSS columns가 아니라 고정 칼럼 컨테이너 + 인덱스 라운드로빈 분배다** —
// CSS columns는 무한 스크롤이 페이지를 이어 붙일 때마다 전체를 다시 분배해 보고 있던 카드가
// 다른 칼럼으로 점프한다(2026-08-06 컬렉션 사용자 리포트에서 확립된 규칙). `posts[i]`는 항상
// `i % 칼럼수` 칼럼에 들어가므로 뒤에 항목이 붙어도 앞 항목의 자리는 안 바뀐다.
//
// **검색창이 없다** — 전용 도메인 전환(ADR-0033)에서 서버 검색은 후속으로 갈렸다(결정 6:
// ES 색인 파이프라인이 붙어 무게가 다르다). 대신 정렬 탭(최신/인기)과 태그 칩이 서버 필터다.

import { useRouter } from 'next/navigation';
import { useMemo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { DESK_FEED_CHIP_LIMIT } from '@/utils/deskFeedChipTags';
import type { DeskFeedSort, DeskFeedSummaryResponse } from '@/types/deskFeed';
import DeskFeedCard from './DeskFeedCard';

// 매스너리 칼럼 수 — Tailwind sm(640)/lg(1024) 브레이크포인트와 동일한 기준.
// useSyncExternalStore 구독쌍이라 매 렌더 새 함수를 만들지 않게 모듈 스코프에 둔다.
const subscribeViewport = (onChange: () => void): (() => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const getColumnCount = (): number =>
  window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
const getServerColumnCount = (): number => 3;

const SORT_TABS: { value: DeskFeedSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '인기순' },
];

type Props = {
  posts: DeskFeedSummaryResponse[];
  sort: DeskFeedSort;
  onSortChange: (sort: DeskFeedSort) => void;
  /** 칩 줄에 그릴 태그들 — 로더가 필터 없는 응답에서 모아 둔 값이다(필터 응답은 편향된다).
   *  **순서는 등장 글 수 내림차순으로 이미 정해져 왔다**(`utils/deskFeedChipTags.ts`) — 여기서
   *  다시 정렬하면 그 위계가 지워진다. */
  tags: string[];
  /** 선택된 태그 칩. 로더가 들고 있다 — 바뀌면 첫 커서부터 다시 조회해야 한다. */
  selectedTag: string | null;
  /** 칩 클릭 — 로더가 `?hashtag=`로 바꿔 다시 조회한다. `null`이면 '전체'다. */
  onTagChange: (tag: string | null) => void;
  hasNext: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
};

const DeskFeedGallery = ({
  posts,
  sort,
  onSortChange,
  tags,
  selectedTag,
  onTagChange,
  hasNext,
  isLoadingMore,
  onLoadMore,
}: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();

  // 인덱스 라운드로빈 분배 — posts 앞부분이 그대로면(무한 스크롤 append) 기존 카드의
  // 칼럼·순서도 그대로다. 파일 상단 주석 참고.
  const columnCount = useSyncExternalStore(subscribeViewport, getColumnCount, getServerColumnCount);
  const postColumns = useMemo(() => {
    const columns: DeskFeedSummaryResponse[][] = Array.from({ length: columnCount }, () => []);
    posts.forEach((post, index) => {
      columns[index % columnCount].push(post);
    });
    return columns;
  }, [posts, columnCount]);

  // 선택된 태그는 칩 줄에 항상 있어야 한다 — 필터가 걸린 응답에서는 칩을 안 모으므로(로더 주석)
  // 그 태그가 목록에 없으면 눌린 칩이 사라져 해제할 방법이 없어진다.
  const allTags = useMemo(
    () => (selectedTag === null || tags.includes(selectedTag) ? tags : [selectedTag, ...tags]),
    [tags, selectedTag],
  );

  // 기본은 상위 12개만 — 상한이 없으면 무한 스크롤이 태그를 추가할 때마다 칩 줄이 자라 갤러리를
  // 아래로 밀고, 40여 개가 같은 무게로 늘어서 눈이 붙을 곳이 없어진다(순서·상한 근거는 유틸 주석).
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const visibleTags = isTagsExpanded ? allTags : allTags.slice(0, DESK_FEED_CHIP_LIMIT);
  const hiddenTagCount = allTags.length - visibleTags.length;

  // 감시점이 화면에 들어오면 다음 페이지를 당긴다 — 중복 호출은 로더의 isLoadingMore 가드가 막는다.
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

  return (
    <div className="font-swiss tracking-[-0.03em]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary-700 mb-2 text-[13px] font-medium tabular-nums">
            책상을 올려보세요
          </p>
          <h1 className="text-ink text-[26px] leading-[1.2] font-medium sm:text-[32px]">
            데스크피드
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            if (requireAuth()) router.push('/desk-feed/new');
          }}
          className="bg-ink text-paper shrink-0 cursor-pointer self-start rounded-3xl px-5 py-2.5 text-[15px] font-medium transition-opacity hover:opacity-90 sm:self-auto"
        >
          업로드하기
        </button>
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
          {visibleTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagChange(selectedTag === tag ? null : tag)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                selectedTag === tag
                  ? 'bg-ink border-ink text-paper'
                  : 'border-ash/40 text-ash hover:border-ink hover:text-ink'
              }`}
            >
              #{tag}
            </button>
          ))}
          {(hiddenTagCount > 0 || isTagsExpanded) && (
            <button
              type="button"
              onClick={() => setIsTagsExpanded((expanded) => !expanded)}
              aria-expanded={isTagsExpanded}
              className="text-ash hover:text-ink decoration-ash/40 cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium underline transition-colors"
            >
              {isTagsExpanded ? '접기' : `+${hiddenTagCount}개 더`}
            </button>
          )}
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

      {posts.length === 0 ? (
        <p className="text-ash py-16 text-center text-[16px]">
          {selectedTag === null
            ? '아직 올라온 책상 사진이 없어요. 첫 사진을 올려보세요!'
            : `#${selectedTag} 태그가 붙은 사진이 아직 없어요.`}
        </p>
      ) : (
        <div className="flex gap-1">
          {postColumns.map((columnPosts, columnIndex) => (
            <div key={columnIndex} className="min-w-0 flex-1">
              {columnPosts.map((post) => (
                <DeskFeedCard key={post.id} post={post} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 무한 스크롤 감시점 — 뷰포트보다 200px 먼저 당긴다. */}
      {hasNext && (
        <div ref={sentinelRef} className="py-10 text-center">
          <p className="text-ash text-[14px]">{isLoadingMore ? '불러오는 중…' : ' '}</p>
        </div>
      )}
    </div>
  );
};

export default DeskFeedGallery;
