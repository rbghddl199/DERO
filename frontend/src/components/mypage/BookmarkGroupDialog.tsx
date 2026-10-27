'use client';
// 북마크 그룹 만들기·수정 창 — 수정 모드에서는 삭제도 여기서 한다(삭제해도 북마크 자체는 남고
// '그룹 없음'으로 간다는 걸 확인 문구에 명시). 삭제만을 위한 별도 확인 창을 두지 않고 이 창 안에서
// 2단계(삭제 → 확인)로 받는다.

import { useEffect, useState } from 'react';
import BodyPortal from '@/components/common/BodyPortal';
import {
  BOOKMARK_GROUP_DESCRIPTION_MAX_LENGTH,
  BOOKMARK_GROUP_TITLE_MAX_LENGTH,
} from '@/constants/interaction';
import type { BookmarkGroupInput, BookmarkGroupResponse } from '@/types/interaction';

type Props = {
  /** null이면 새 그룹 만들기 */
  group: BookmarkGroupResponse | null;
  onSubmit: (input: BookmarkGroupInput) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onClose: () => void;
};

const BookmarkGroupDialog = ({ group, onSubmit, onDelete, onClose }: Props) => {
  const [title, setTitle] = useState(group?.title ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === '' || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: trimmedTitle,
        description: description.trim() === '' ? null : description.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (onDelete === null || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onDelete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={isSubmitting ? undefined : onClose}
      >
        <form
          onSubmit={(event) => void handleSubmit(event)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bookmark-group-dialog-title"
          className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="bookmark-group-dialog-title" className="text-xl font-bold text-neutral-900">
            {group === null ? '새 북마크 그룹' : '그룹 수정'}
          </h2>

          <label className="mt-6 block text-sm font-semibold text-neutral-700">
            이름
            <input
              type="text"
              value={title}
              autoFocus
              required
              maxLength={BOOKMARK_GROUP_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 화이트 데스크"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-[15px] font-normal text-neutral-900"
            />
          </label>

          <label className="mt-4 block text-sm font-semibold text-neutral-700">
            설명 (선택)
            <textarea
              value={description}
              rows={3}
              maxLength={BOOKMARK_GROUP_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="어떤 데스크를 모을 그룹인가요?"
              className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 text-[15px] font-normal text-neutral-900"
            />
          </label>

          <div className="mt-7 flex gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || title.trim() === ''}
              className="flex-1 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {group === null ? '만들기' : '저장'}
            </button>
          </div>

          {onDelete !== null && (
            <div className="mt-6 border-t border-neutral-200 pt-5">
              {isConfirmingDelete ? (
                <>
                  <p className="text-sm leading-6 text-neutral-600">
                    그룹만 삭제됩니다. 담겨 있던 북마크는 사라지지 않고 &lsquo;그룹 없음&rsquo;으로
                    옮겨져요.
                  </p>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setIsConfirmingDelete(false)}
                      className="flex-1 rounded-xl border border-neutral-300 bg-white py-2.5 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleDelete()}
                      className="text-danger-500 border-danger-500/40 flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      그룹 삭제
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsConfirmingDelete(true)}
                  className="text-danger-500 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이 그룹 삭제
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </BodyPortal>
  );
};

export default BookmarkGroupDialog;
