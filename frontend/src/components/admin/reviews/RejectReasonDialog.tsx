'use client';
// 검수 반려 사유 입력 모달 — 사유가 비면 반려할 수 없다(asset.review_note, 최대 500자).

import { useEffect, useState } from 'react';

import BodyPortal from '@/components/common/BodyPortal';
import { REVIEW_NOTE_MAX_LENGTH } from '@/constants/admin/productLabels';

type Props = {
  productName: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
};

const RejectReasonDialog = ({ productName, isSubmitting, onCancel, onConfirm }: Props) => {
  const [note, setNote] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // 파생 상태라 렌더 중에 계산한다
  const noteError = note.trim() === '' ? '반려 사유를 입력해주세요.' : null;
  const visibleError = hasAttemptedSubmit ? noteError : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isSubmitting]);

  const handleConfirm = (): void => {
    if (noteError !== null) {
      setHasAttemptedSubmit(true);
      return;
    }
    onConfirm(note.trim());
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={isSubmitting ? undefined : onCancel}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-busy={isSubmitting}
          aria-labelledby="reject-reason-title"
          aria-describedby="reject-reason-help"
          className="font-swiss w-full max-w-[520px] rounded-2xl bg-white p-7 tracking-[-0.03em] shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="reject-reason-title" className="text-ink text-xl font-bold">
            반려 사유를 적어주세요
          </h2>
          <p className="text-ash mt-2 text-[14px] leading-6">
            &lsquo;{productName}&rsquo;을(를) 반려합니다.
          </p>

          <label className="mt-5 flex flex-col gap-1.5">
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, REVIEW_NOTE_MAX_LENGTH))}
              rows={5}
              placeholder="예) 상판 두께가 카탈로그 표기와 다릅니다. 실측값으로 다시 올려주세요."
              aria-invalid={visibleError ? true : undefined}
              aria-describedby="reject-reason-help"
              className={`bg-paper text-ink placeholder:text-ash resize-none rounded-[10px] border px-4 py-3 text-[15px] outline-none ${
                visibleError ? 'border-danger-500' : 'border-ash/40'
              }`}
            />
            <p id="reject-reason-help" className="text-ash text-[13px] leading-5">
              필수. 등록자에게 그대로 보이는 문구이니 무엇을 고쳐야 하는지 구체적으로 적어주세요.
              최대 {REVIEW_NOTE_MAX_LENGTH}자 (현재 {note.length}자).
            </p>
            {visibleError && (
              <p role="alert" className="text-danger-700 text-[13px] leading-5">
                {visibleError}
              </p>
            )}
          </label>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="border-ash/30 text-ink rounded-[10px] border px-5 py-2.5 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirm}
              className="bg-danger-500 rounded-[10px] px-5 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? '반려하는 중...' : '반려'}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default RejectReasonDialog;
