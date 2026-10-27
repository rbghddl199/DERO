// 마스터 항목 삭제 확인 창 — 삭제는 소프트 삭제지만 참조 게이트에 걸리면 409로 거절된다.
// 409는 실패지만 정상 흐름이라(제품이 참조 중) 창을 닫지 않고 창 안에 사유를 그대로 보여 준다.

'use client';

import { useState } from 'react';

import MasterDialog from '@/components/admin/masters/MasterDialog';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import InlineNotice from '@/components/common/InlineNotice';
import { MASTER_DANGER_BUTTON_CLASS, MASTER_GHOST_BUTTON_CLASS } from '@/constants/admin/masters';

type Props = {
  /** 지울 항목을 사람이 알아볼 이름 — 표에 보이는 값과 같아야 한다 */
  itemLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  /** 삭제가 실제로 끝났을 때만 부른다(목록 재조회·창 닫기는 호출부가 한다) */
  onDeleted: () => void;
};

const MasterDeleteDialog = ({ itemLabel, onCancel, onConfirm, onDeleted }: Props) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (isDeleting) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onConfirm();
      onDeleted();
    } catch (error: unknown) {
      setErrorMessage(toMasterErrorMessage(error, '삭제하지 못했습니다.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <MasterDialog
      title="삭제하시겠습니까?"
      role="alertdialog"
      isBusy={isDeleting}
      onClose={onCancel}
    >
      <p className="text-ink text-[15px] leading-6">
        <span className="font-semibold">{itemLabel}</span> 을(를) 삭제합니다. 이미 이 값을 쓰고 있는
        제품이 있으면 삭제되지 않습니다.
      </p>

      {errorMessage ? (
        <div className="mt-4">
          <InlineNotice variant="error" message={errorMessage} />
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          disabled={isDeleting}
          onClick={onCancel}
          className={MASTER_GHOST_BUTTON_CLASS}
        >
          취소
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => {
            void handleConfirm();
          }}
          className={MASTER_DANGER_BUTTON_CLASS}
        >
          {isDeleting ? '삭제 중' : '삭제'}
        </button>
      </div>
    </MasterDialog>
  );
};

export default MasterDeleteDialog;
