'use client';
// 배치 상세의 북마크 버튼을 누르면 뜨는 그룹 선택 창 — 현재 그룹 표시 + 그룹 선택 + "그룹 없이 저장"
// + "새 그룹 만들기" + (이미 북마크됐다면) 해제. 그룹 이동도 저장과 같은 PUT 하나라(별도 이동 API가
// 없다) 다른 그룹을 고르면 그대로 onSelect가 불린다.

import { useEffect, useState } from 'react';
import BodyPortal from '@/components/common/BodyPortal';
import { createBookmarkGroup, getBookmarkGroups } from '@/api/bookmark';
import { BOOKMARK_GROUP_TITLE_MAX_LENGTH } from '@/constants/interaction';
import type { BookmarkGroupResponse } from '@/types/interaction';

type Props = {
  isBookmarked: boolean;
  currentGroupId: number | null;
  isSubmitting: boolean;
  /** groupId가 null이면 그룹 없이 저장 */
  onSelect: (groupId: number | null) => void;
  onRemove: () => void;
  onClose: () => void;
};

const BookmarkGroupPicker = ({
  isBookmarked,
  currentGroupId,
  isSubmitting,
  onSelect,
  onRemove,
  onClose,
}: Props) => {
  const [groups, setGroups] = useState<BookmarkGroupResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBookmarkGroups()
      .then((loaded) => {
        if (!cancelled) setGroups(loaded);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('그룹 목록을 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCreateGroup = async (): Promise<void> => {
    const title = newGroupTitle.trim();
    if (title === '' || isCreating) return;

    setIsCreating(true);
    setErrorMessage(null);
    try {
      const created = await createBookmarkGroup({ title });
      setNewGroupTitle('');
      setGroups((prev) => [...prev, created]);
      onSelect(created.id);
    } catch (error) {
      console.error('[BookmarkGroupPicker] 그룹 생성에 실패했습니다', error);
      setErrorMessage('그룹을 만들지 못했어요. 다시 시도해주세요.');
    } finally {
      setIsCreating(false);
    }
  };

  const isBusy = isSubmitting || isCreating;

  const rowClassName = (isSelected: boolean): string =>
    `flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-left text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      isSelected
        ? 'border-ink bg-fog text-ink font-medium'
        : 'border-ash/30 text-ink hover:border-ink'
    }`;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={isBusy ? undefined : onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bookmark-group-picker-title"
          className="font-swiss w-full max-w-[420px] rounded-2xl bg-white p-6 tracking-[-0.03em] shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="bookmark-group-picker-title" className="text-ink text-[20px] font-medium">
            북마크 그룹 선택
          </h2>
          <p className="text-ash mt-2 text-[14px] leading-[1.6]">
            이 데스크테리어를 담을 그룹을 골라주세요.
          </p>

          {isLoading ? (
            <p className="text-ash mt-5 text-[14px]">그룹을 불러오는 중...</p>
          ) : (
            <div className="mt-5 flex max-h-[280px] flex-col gap-2 overflow-y-auto">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onSelect(null)}
                className={rowClassName(isBookmarked && currentGroupId === null)}
              >
                <span>그룹 없이 저장</span>
                {isBookmarked && currentGroupId === null && (
                  <span className="text-ash shrink-0 text-[13px]">현재</span>
                )}
              </button>

              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => onSelect(group.id)}
                  className={rowClassName(currentGroupId === group.id)}
                >
                  <span className="truncate">{group.title}</span>
                  <span className="text-ash shrink-0 text-[13px] tabular-nums">
                    {currentGroupId === group.id ? '현재' : `${group.bookmarkCount}개`}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="border-ash/20 mt-5 flex gap-2 border-t pt-5">
            <input
              type="text"
              value={newGroupTitle}
              maxLength={BOOKMARK_GROUP_TITLE_MAX_LENGTH}
              onChange={(event) => setNewGroupTitle(event.target.value)}
              placeholder="새 그룹 이름"
              className="border-ash/40 text-ink placeholder:text-ash min-w-0 flex-1 rounded-[10px] border px-3 py-2.5 text-[14px]"
            />
            <button
              type="button"
              disabled={isBusy || newGroupTitle.trim() === ''}
              onClick={() => void handleCreateGroup()}
              className="bg-ink text-paper hover:bg-ink/85 shrink-0 cursor-pointer rounded-[10px] px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              만들기
            </button>
          </div>

          {errorMessage && <p className="text-danger-500 mt-3 text-[13px]">{errorMessage}</p>}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="border-ash/40 text-ink hover:bg-fog flex-1 cursor-pointer rounded-[10px] border py-3 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              닫기
            </button>
            {isBookmarked && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onRemove}
                className="text-danger-500 border-danger-500/40 hover:bg-danger-50 flex-1 cursor-pointer rounded-[10px] border py-3 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                북마크 해제
              </button>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default BookmarkGroupPicker;
