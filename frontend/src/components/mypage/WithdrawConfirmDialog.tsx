// 회원 탈퇴 확인과 중복 요청 차단 상태를 제공한다.

'use client';

import { useEffect, useRef, useState } from 'react';

import BodyPortal from '@/components/common/BodyPortal';
import { runLogoutRequest } from '@/components/mypage/LogoutConfirmDialog';

type WithdrawConfirmDialogContentProps = {
  isWithdrawing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const WithdrawConfirmDialogContent = ({
  isWithdrawing,
  onCancel,
  onConfirm,
}: WithdrawConfirmDialogContentProps) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    onClick={isWithdrawing ? undefined : onCancel}
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy={isWithdrawing}
      aria-labelledby="withdraw-confirm-title"
      aria-describedby="withdraw-confirm-description"
      className="w-full max-w-[380px] rounded-2xl bg-white p-7 text-center shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
      onClick={(event) => event.stopPropagation()}
    >
      <h2 id="withdraw-confirm-title" className="text-xl font-bold text-neutral-900">
        회원 탈퇴
      </h2>
      <p id="withdraw-confirm-description" className="mt-3 text-sm leading-6 text-neutral-600">
        탈퇴 시에는 모든 정보가 사라지게 됩니다. 정말 탈퇴하시겠어요?
      </p>

      <div className="mt-7 flex gap-3">
        <button
          type="button"
          autoFocus
          disabled={isWithdrawing}
          onClick={onCancel}
          className="flex-1 rounded-xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          아니요
        </button>
        <button
          type="button"
          disabled={isWithdrawing}
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isWithdrawing ? '탈퇴 처리 중' : '예'}
        </button>
      </div>
    </div>
  </div>
);

type WithdrawConfirmDialogProps = {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

const WithdrawConfirmDialog = ({ onCancel, onConfirm }: WithdrawConfirmDialogProps) => {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const requestLock = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !requestLock.current) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = async (): Promise<void> => {
    if (requestLock.current) return;

    setIsWithdrawing(true);
    try {
      await runLogoutRequest(requestLock, onConfirm);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <BodyPortal>
      <WithdrawConfirmDialogContent
        isWithdrawing={isWithdrawing}
        onCancel={onCancel}
        onConfirm={() => {
          void handleConfirm();
        }}
      />
    </BodyPortal>
  );
};

export default WithdrawConfirmDialog;
