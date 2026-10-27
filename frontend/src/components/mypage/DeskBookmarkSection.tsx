'use client';
// 마이페이지 북마크 패널의 컬렉션 북마크 영역 — 그룹 칩(전체/그룹 없음/그룹별)으로 걸러
// 내가 북마크한 배치 목록을 받아 그리고, 그룹 만들기·수정·삭제를 여기서 한다.
// 이 컴포넌트는 MypageShell의 AuthBoundary 안에서만 렌더되므로 로그인 상태를 다시 확인하지 않는다.
//
// 목록은 `GET /placements?bookmarked=me&bookmarkGroup=`이다(2026-08-02, DERO-343) — 종전
// `GET /bookmarks`는 삭제됐다. 그래서 카드가 썸네일(presigned GET URL)과 `/collection/{id}` 상세
// 링크를 갖는다: 북마크 전용 응답은 스토리지 key만 줘서 이미지를 못 그렸고 목록 글 id와의 매핑도
// 없었는데, 배치 요약은 둘 다 이미 갖고 있다.
//
// 정렬은 담은 순서가 아니라 배치 최신순이다 — 서버에 "북마크한 시각" 정렬이 없다.
// 썸네일은 common/RemoteImage(next/image)로 그린다 — 조회 URL이 안정 공개 URL이 되면서 호스트를
// remotePatterns에 등록할 수 있게 됐다(ADR-0035 결정 5). 로드 실패 처리도 그 컴포넌트가 갖는다.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import RemoteImage from '@/components/common/RemoteImage';
import Toast from '@/components/common/Toast';
import BookmarkGroupDialog from '@/components/mypage/BookmarkGroupDialog';
import {
  createBookmarkGroup,
  deleteBookmarkGroup,
  getBookmarkGroups,
  updateBookmarkGroup,
} from '@/api/bookmark';
import { listPlacements } from '@/api/placement';
import { deletePlacementBookmark, putPlacementBookmark } from '@/api/interaction';
import { BOOKMARK_PAGE_SIZE } from '@/constants/interaction';
import type { BookmarkGroupInput, BookmarkGroupResponse } from '@/types/interaction';
import type { PlacementSummaryResponse } from '@/types/placement';
import { formatRelativeTime } from '@/utils/formatRelativeTime';

/** 'all'=전체, 'none'=그룹 미지정, number=그 그룹 */
type Selection = 'all' | 'none' | number;

type ListState =
  | {
      selection: Selection;
      status: 'ready';
      items: PlacementSummaryResponse[];
      nextCursor: string | null;
      hasNext: boolean;
      totalCount: number;
    }
  | { selection: Selection; status: 'error' };

type DialogState = { mode: 'create' } | { mode: 'edit'; group: BookmarkGroupResponse } | null;

/** bookmarkGroup은 bookmarked=me와 같이 보낼 때만 유효하다 — '전체'는 아예 안 싣는다. */
const toBookmarkGroupParam = (selection: Selection): number | 'none' | undefined =>
  selection === 'all' ? undefined : selection;

const listBookmarkedPlacements = (selection: Selection, cursor: string | null) =>
  listPlacements({
    bookmarked: 'me',
    bookmarkGroup: toBookmarkGroupParam(selection),
    sort: 'latest',
    cursor,
    size: BOOKMARK_PAGE_SIZE,
  });

const DeskBookmarkSection = () => {
  const [selection, setSelection] = useState<Selection>('all');
  const [groups, setGroups] = useState<BookmarkGroupResponse[] | null>(null);
  const [listState, setListState] = useState<ListState | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  /** 썸네일 URL은 key가 결정론적이라 아직 캡처 안 한 배치도 채워져 온다 — truthy로 판단할 수 없어
   *  로드 실패를 직접 모아 두고 그 카드만 빈 자리로 둔다(craft/CLAUDE.md의 같은 함정). */
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** 서버에는 즉시 쓰되 카드 제거는 다음 메뉴 진입·새로고침까지 미룬다. 값은 현재 북마크 여부다. */
  const [pendingBookmarks, setPendingBookmarks] = useState<ReadonlyMap<number, boolean>>(new Map());
  /** 그룹 CRUD 뒤 목록·그룹을 다시 받기 위한 트리거 */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getBookmarkGroups()
      .then((loaded) => {
        if (!cancelled) setGroups(loaded);
      })
      .catch((error: unknown) => {
        console.error('[DeskBookmarkSection] 북마크 그룹을 불러오지 못했습니다', error);
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    listBookmarkedPlacements(selection, null)
      .then((page) => {
        if (cancelled) return;
        setListState({
          selection,
          status: 'ready',
          items: page.content,
          nextCursor: page.nextCursor,
          hasNext: page.hasNext,
          totalCount: page.totalCount,
        });
      })
      .catch((error: unknown) => {
        console.error('[DeskBookmarkSection] 북마크 목록을 불러오지 못했습니다', error);
        if (!cancelled) setListState({ selection, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [selection, reloadToken]);

  // 선택이 바뀐 직후엔 아직 그 선택의 결과가 없다 — 상태를 이펙트에서 지우는 대신 이렇게 파생한다.
  const isLoading = listState === null || listState.selection !== selection;

  const groupTitleOf = (groupId: number | null): string =>
    groupId === null
      ? '그룹 없음'
      : ((groups ?? []).find((group) => group.id === groupId)?.title ?? '그룹 없음');

  const handleLoadMore = async (): Promise<void> => {
    if (listState === null || listState.status !== 'ready' || listState.nextCursor === null) return;
    if (isLoadingMore) return;

    setIsLoadingMore(true);
    const cursor = listState.nextCursor;
    try {
      const page = await listBookmarkedPlacements(selection, cursor);
      setListState((prev) =>
        prev === null || prev.status !== 'ready' || prev.selection !== selection
          ? prev
          : {
              ...prev,
              items: [...prev.items, ...page.content],
              nextCursor: page.nextCursor,
              hasNext: page.hasNext,
              totalCount: page.totalCount,
            },
      );
    } catch (error) {
      console.error('[DeskBookmarkSection] 북마크를 더 불러오지 못했습니다', error);
      setToastMessage('북마크를 더 불러오지 못했어요.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSubmitGroup = async (input: BookmarkGroupInput): Promise<void> => {
    try {
      if (dialog?.mode === 'edit') {
        await updateBookmarkGroup(dialog.group.id, input);
      } else {
        await createBookmarkGroup(input);
      }
      setDialog(null);
      setReloadToken((token) => token + 1);
    } catch (error) {
      console.error('[DeskBookmarkSection] 그룹 저장에 실패했습니다', error);
      setToastMessage('그룹을 저장하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleDeleteGroup = async (groupId: number): Promise<void> => {
    try {
      await deleteBookmarkGroup(groupId);
      setDialog(null);
      if (selection === groupId) setSelection('all');
      setReloadToken((token) => token + 1);
    } catch (error) {
      console.error('[DeskBookmarkSection] 그룹 삭제에 실패했습니다', error);
      setToastMessage('그룹을 삭제하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleToggleBookmark = async (placement: PlacementSummaryResponse): Promise<void> => {
    const current = pendingBookmarks.get(placement.id) ?? true;
    const next = !current;
    setPendingBookmarks((values) => new Map(values).set(placement.id, next));
    setToastMessage(next ? '북마크에 다시 저장되었습니다.' : '북마크를 해제했습니다.');

    try {
      if (next) {
        await putPlacementBookmark(placement.id, placement.bookmarkGroupId);
      } else {
        await deletePlacementBookmark(placement.id);
      }
    } catch (error) {
      console.error('[DeskBookmarkSection] 북마크 처리에 실패했습니다', error);
      setPendingBookmarks((values) => {
        const rolledBack = new Map(values);
        rolledBack.delete(placement.id);
        return rolledBack;
      });
      setToastMessage('북마크를 처리하지 못했어요. 다시 시도해주세요.');
    }
  };

  const chipClassName = (isSelected: boolean): string =>
    `cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      isSelected
        ? 'border-neutral-900 bg-neutral-900 text-white'
        : 'border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900'
    }`;

  return (
    <section aria-labelledby="desk-bookmark-title" className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="desk-bookmark-title" className="text-xl font-bold text-neutral-900">
          컬렉션 북마크
        </h2>
        <button
          type="button"
          onClick={() => setDialog({ mode: 'create' })}
          className="cursor-pointer rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          새 그룹 만들기
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelection('all')}
          className={chipClassName(selection === 'all')}
        >
          전체
        </button>
        <button
          type="button"
          onClick={() => setSelection('none')}
          className={chipClassName(selection === 'none')}
        >
          그룹 없음
        </button>
        {(groups ?? []).map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setSelection(group.id)}
            className={chipClassName(selection === group.id)}
          >
            {group.title} {group.bookmarkCount}
          </button>
        ))}
      </div>

      {typeof selection === 'number' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              const group = (groups ?? []).find((candidate) => candidate.id === selection);
              if (group) setDialog({ mode: 'edit', group });
            }}
            className="cursor-pointer text-sm font-semibold text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
          >
            이 그룹 수정·삭제
          </button>
        </div>
      )}

      <div className="mt-5">
        {isLoading && <p className="text-[15px] text-neutral-500">북마크를 불러오는 중...</p>}

        {!isLoading && listState.status === 'error' && (
          <p className="text-[15px] text-neutral-500">
            북마크를 불러올 수 없어요. 잠시 후 다시 시도해주세요.
          </p>
        )}

        {!isLoading && listState.status === 'ready' && listState.items.length === 0 && (
          <p className="text-[15px] text-neutral-500">이 그룹에 담긴 컬렉션 북마크가 없어요.</p>
        )}

        {!isLoading && listState.status === 'ready' && listState.items.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-4">
              {listState.items.map((placement) => (
                <li
                  key={placement.id}
                  className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                >
                  <Link
                    href={`/collection/${placement.id}?returnTo=${encodeURIComponent('/mypage?menu=bookmark')}`}
                    className="group block"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                      {placement.thumbnailUrl !== null && (
                        <RemoteImage
                          src={placement.thumbnailUrl}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 33vw, 50vw"
                          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                        />
                      )}
                    </div>
                    <div className="p-5">
                      <p className="truncate text-[16px] font-semibold text-neutral-900">
                        {placement.title}
                      </p>
                      <p className="mt-2 text-[13px] text-neutral-500">
                        {groupTitleOf(placement.bookmarkGroupId)} · 좋아요{' '}
                        <span className="tabular-nums">{placement.likeCount}</span>
                      </p>
                      <p className="mt-1 text-[13px] text-neutral-400 tabular-nums">
                        {formatRelativeTime(placement.createdAt)}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-pressed={pendingBookmarks.get(placement.id) ?? true}
                    aria-label={
                      (pendingBookmarks.get(placement.id) ?? true)
                        ? '북마크 해제'
                        : '북마크 다시 저장'
                    }
                    onClick={() => void handleToggleBookmark(placement)}
                    className={`absolute top-3 right-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors ${
                      (pendingBookmarks.get(placement.id) ?? true)
                        ? 'bg-primary-300 text-ink border-transparent'
                        : 'border-ink/10 text-ash hover:text-ink bg-white/90'
                    }`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill={(pendingBookmarks.get(placement.id) ?? true) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.4"
                      aria-hidden="true"
                    >
                      <path d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11Z" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>

            {listState.hasNext && (
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={() => void handleLoadMore()}
                className="mt-5 w-full cursor-pointer rounded-xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            )}
          </>
        )}
      </div>

      {dialog !== null && (
        <BookmarkGroupDialog
          group={dialog.mode === 'edit' ? dialog.group : null}
          onSubmit={handleSubmitGroup}
          onDelete={dialog.mode === 'edit' ? () => handleDeleteGroup(dialog.group.id) : null}
          onClose={() => setDialog(null)}
        />
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </section>
  );
};

export default DeskBookmarkSection;
