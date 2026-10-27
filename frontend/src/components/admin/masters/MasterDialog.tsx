// 관리자 화면 공용 모달 껍데기 — 마스터 편집·삭제 확인 창과 제품 이미지 삭제 확인이 함께 쓴다.
// LogoutConfirmDialog와 같은 패턴이다(BodyPortal + 배경 클릭·Escape 닫기 + aria-modal).

'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

import BodyPortal from '@/components/common/BodyPortal';

type Props = {
  title: string;
  /** true면 요청 중이라 배경 클릭·Escape로 닫히지 않는다 */
  isBusy?: boolean;
  /** 삭제 확인은 alertdialog, 편집 폼은 dialog */
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  children: ReactNode;
};

const MasterDialog = ({ title, isBusy = false, role = 'dialog', onClose, children }: Props) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isBusy) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-10"
        onClick={isBusy ? undefined : onClose}
      >
        <div
          role={role}
          aria-modal="true"
          aria-busy={isBusy}
          aria-label={title}
          className="font-swiss max-h-full w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-7 tracking-[-0.03em] shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 className="text-ink text-xl font-bold">{title}</h2>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default MasterDialog;
