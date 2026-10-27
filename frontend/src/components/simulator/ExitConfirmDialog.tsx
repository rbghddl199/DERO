'use client';
// 나가기 확인 모달 — HUD 나가기 버튼 클릭 시 오버레이로 띄워 실수로 인한 이탈을 막는다.

import { useEffect } from 'react';

type Props = {
  hasUnsavedChanges: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ExitConfirmDialog = ({ hasUnsavedChanges, onConfirm, onCancel }: Props) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" data-testid="exit-confirm-overlay" onClick={onCancel}>
      <div
        className="glass modal-card exit-confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="exit-confirm-title"
        data-testid="exit-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="exit-confirm-title" className="h2">
          {hasUnsavedChanges ? '저장하지 않고 나가시겠습니까?' : '작업실을 나가시겠습니까?'}
        </div>
        <p className="muted">
          {hasUnsavedChanges
            ? '저장하지 않은 변경 사항이 있습니다. 저장하려면 취소 후 저장 버튼을 눌러 주세요.'
            : '작업실 목록으로 이동합니다.'}
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="exit-confirm-cancel"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="exit-confirm-ok"
            onClick={onConfirm}
          >
            {hasUnsavedChanges ? '저장하지않음' : '나가기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExitConfirmDialog;
