'use client';
// 배치 선택 삭제 확인 모달 — CraftDeskCollection의 삭제하기 흐름에서 실수 삭제를 막는다.

import { useEffect } from 'react';
import BodyPortal from '@/components/common/BodyPortal';

type Props = {
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const DeleteConfirmDialog = ({ count, isDeleting, onConfirm, onCancel }: Props) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={onCancel}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="w-full max-w-[360px] rounded-2xl bg-white p-6 text-center shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="delete-confirm-title" className="text-ink text-[17px] font-semibold">
            {count}개의 데스크테리어를 삭제할까요?
          </h2>
          <p className="text-ash mt-2 text-[14px]">삭제하면 되돌릴 수 없어요.</p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="border-ash/40 text-ink flex-1 rounded-xl border py-3 text-[15px] font-medium transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="bg-danger-500 hover:bg-danger-700 flex-1 rounded-xl py-3 text-[15px] font-medium text-white transition-colors disabled:opacity-50"
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default DeleteConfirmDialog;
