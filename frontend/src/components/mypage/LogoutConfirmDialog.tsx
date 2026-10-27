// 마이페이지 로그아웃 확인과 중복 요청 차단 상태를 제공한다.

'use client';

import { useEffect, useRef, useState } from 'react';

import BodyPortal from '@/components/common/BodyPortal';

export type LogoutRequestLock = {
  current: boolean;
};

export const runLogoutRequest = async (
  lock: LogoutRequestLock,
  request: () => Promise<void>,
): Promise<boolean> => {
  if (lock.current) return false;

  lock.current = true;
  try {
    await request();
    return true;
  } finally {
    lock.current = false;
  }
};

type LogoutConfirmDialogContentProps = {
  isLoggingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const LogoutConfirmDialogContent = ({
  isLoggingOut,
  onCancel,
  onConfirm,
}: LogoutConfirmDialogContentProps) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    onClick={isLoggingOut ? undefined : onCancel}
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy={isLoggingOut}
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-description"
      className="w-full max-w-[380px] rounded-2xl bg-white p-7 text-center shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
      onClick={(event) => event.stopPropagation()}
    >
      <h2 id="logout-confirm-title" className="text-xl font-bold text-neutral-900">
        로그아웃하시겠습니까?
      </h2>
      <p id="logout-confirm-description" className="mt-3 text-sm leading-6 text-neutral-600">
        저장하지 않은 변경 사항은 사라집니다.
      </p>

      <div className="mt-7 flex gap-3">
        <button
          type="button"
          autoFocus
          disabled={isLoggingOut}
          onClick={onCancel}
          className="flex-1 rounded-xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? '로그아웃 중' : '로그아웃'}
        </button>
      </div>
    </div>
  </div>
);

type LogoutConfirmDialogProps = {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

const LogoutConfirmDialog = ({ onCancel, onConfirm }: LogoutConfirmDialogProps) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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

    setIsLoggingOut(true);
    try {
      await runLogoutRequest(requestLock, onConfirm);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <BodyPortal>
      <LogoutConfirmDialogContent
        isLoggingOut={isLoggingOut}
        onCancel={onCancel}
        onConfirm={() => {
          void handleConfirm();
        }}
      />
    </BodyPortal>
  );
};

export default LogoutConfirmDialog;
