// 관리자 VESA 규격 관리 — 모니터 뒷면 홀 간격(가로·세로 mm) 마스터.
// (width_mm, height_mm) 쌍이 부분 유니크라 같은 조합을 또 등록하면 409로 거절된다(erd.md vesa_spec).

'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import {
  createVesaSpec,
  deleteVesaSpec,
  listVesaSpecs,
  updateVesaSpec,
  type VesaSpecResponse,
} from '@/api/admin/masters';
import MasterDeleteDialog from '@/components/admin/masters/MasterDeleteDialog';
import MasterDialog from '@/components/admin/masters/MasterDialog';
import MasterField from '@/components/admin/masters/MasterField';
import MasterPagination from '@/components/admin/masters/MasterPagination';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import InlineNotice from '@/components/common/InlineNotice';
import {
  MASTER_DANGER_BUTTON_CLASS,
  MASTER_GHOST_BUTTON_CLASS,
  MASTER_INPUT_CLASS,
  MASTER_INPUT_ERROR_CLASS,
  MASTER_PRIMARY_BUTTON_CLASS,
  MASTER_TABLE_CELL_CLASS,
  MASTER_TABLE_HEAD_CLASS,
} from '@/constants/admin/masters';
import { useMasterList } from '@/hooks/admin/useMasterList';

interface VesaSpecValues {
  widthMm: number;
  heightMm: number;
}

const WIDTH_HELP =
  '홀 간격 가로를 mm 정수로 입력합니다. 실측값이 정본입니다 — 카탈로그 표기와 다르면 실측을 씁니다. (예: 100×100이면 100)';
const HEIGHT_HELP =
  '홀 간격 세로를 mm 정수로 입력합니다. 가로·세로 조합이 이미 있으면 저장되지 않습니다.';

/** 빈 문자열·소수·음수를 전부 걸러 mm 정수만 통과시킨다 */
const parseMillimeters = (raw: string): number | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 0 ? value : null;
};

type FormProps = {
  initialValues: { widthMm: string; heightMm: string };
  submitLabel: string;
  onSubmit: (values: VesaSpecValues) => Promise<void>;
  onCancel?: () => void;
};

const VesaSpecForm = ({ initialValues, submitLabel, onSubmit, onCancel }: FormProps) => {
  const [widthMm, setWidthMm] = useState(initialValues.widthMm);
  const [heightMm, setHeightMm] = useState(initialValues.heightMm);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파생 상태라 렌더 중에 계산한다
  const parsedWidth = parseMillimeters(widthMm);
  const parsedHeight = parseMillimeters(heightMm);
  const errors: { widthMm?: string; heightMm?: string } = {};
  if (parsedWidth === null) errors.widthMm = '가로를 1 이상 mm 정수로 입력해주세요.';
  if (parsedHeight === null) errors.heightMm = '세로를 1 이상 mm 정수로 입력해주세요.';
  const isValid = Object.keys(errors).length === 0;
  const visibleErrors = hasAttemptedSubmit ? errors : {};

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!isValid || parsedWidth === null || parsedHeight === null) {
      setHasAttemptedSubmit(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ widthMm: parsedWidth, heightMm: parsedHeight });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <MasterField
        label="가로 (mm)"
        help={WIDTH_HELP}
        isRequired
        errorMessage={visibleErrors.widthMm}
      >
        <input
          type="text"
          inputMode="numeric"
          value={widthMm}
          onChange={(event) => setWidthMm(event.target.value)}
          placeholder="100"
          aria-invalid={visibleErrors.widthMm ? true : undefined}
          className={`${visibleErrors.widthMm ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
        />
      </MasterField>

      <MasterField
        label="세로 (mm)"
        help={HEIGHT_HELP}
        isRequired
        errorMessage={visibleErrors.heightMm}
      >
        <input
          type="text"
          inputMode="numeric"
          value={heightMm}
          onChange={(event) => setHeightMm(event.target.value)}
          placeholder="100"
          aria-invalid={visibleErrors.heightMm ? true : undefined}
          className={`${visibleErrors.heightMm ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
        />
      </MasterField>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className={MASTER_GHOST_BUTTON_CLASS}
          >
            취소
          </button>
        ) : null}
        <button type="submit" disabled={isSubmitting} className={MASTER_PRIMARY_BUTTON_CLASS}>
          {isSubmitting ? '저장 중' : submitLabel}
        </button>
      </div>
    </form>
  );
};

const VesaSpecsAdmin = () => {
  const { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload } =
    useMasterList<VesaSpecResponse>(listVesaSpecs);
  const [editing, setEditing] = useState<VesaSpecResponse | null>(null);
  const [deleting, setDeleting] = useState<VesaSpecResponse | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);

  const handleCreate = async (values: VesaSpecValues): Promise<void> => {
    setSubmitErrorMessage(null);
    try {
      await createVesaSpec(values);
      setCreateFormKey((key) => key + 1);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, 'VESA 규격을 등록하지 못했습니다.'));
    }
  };

  const handleUpdate = async (values: VesaSpecValues): Promise<void> => {
    if (editing?.id == null) return;
    setSubmitErrorMessage(null);
    try {
      await updateVesaSpec(editing.id, values);
      setEditing(null);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, 'VESA 규격을 수정하지 못했습니다.'));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">VESA 규격</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        모니터 뒷면 마운트 홀 간격 마스터입니다. 모니터암 호환 판정이 이 값을 그대로 씁니다 — 3D
        메쉬가 아니라 이 mm 값이 정본입니다.
      </p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="border-ash/20 mt-8 rounded-2xl border p-6">
        <h2 className="text-ink text-[17px] font-semibold">새로 등록</h2>
        <div className="mt-4">
          <VesaSpecForm
            key={createFormKey}
            initialValues={{ widthMm: '', heightMm: '' }}
            submitLabel="등록"
            onSubmit={handleCreate}
          />
        </div>
      </section>

      <section className="mt-8">
        {loadErrorMessage ? (
          <InlineNotice variant="error" message={loadErrorMessage} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr>
                  <th className={MASTER_TABLE_HEAD_CLASS}>ID</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>가로 (mm)</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>세로 (mm)</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((spec) => (
                  <tr key={spec.id}>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{spec.id}</td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{spec.widthMm}</td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{spec.heightMm}</td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitErrorMessage(null);
                            setEditing(spec);
                          }}
                          className={MASTER_GHOST_BUTTON_CLASS}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(spec)}
                          className={MASTER_DANGER_BUTTON_CLASS}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && items.length === 0 ? (
              <p className="text-ash py-10 text-center text-[14px]">등록된 규격이 없습니다.</p>
            ) : null}
            {isLoading ? (
              <p className="text-ash py-10 text-center text-[14px]">불러오는 중…</p>
            ) : null}
          </div>
        )}

        <MasterPagination
          page={page}
          pageInfo={pageInfo}
          isLoading={isLoading}
          onChangePage={goToPage}
        />
      </section>

      {editing ? (
        <MasterDialog title="VESA 규격 수정" onClose={() => setEditing(null)}>
          <VesaSpecForm
            initialValues={{
              widthMm: editing.widthMm == null ? '' : String(editing.widthMm),
              heightMm: editing.heightMm == null ? '' : String(editing.heightMm),
            }}
            submitLabel="저장"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </MasterDialog>
      ) : null}

      {deleting ? (
        <MasterDeleteDialog
          itemLabel={`${deleting.widthMm ?? '?'} × ${deleting.heightMm ?? '?'} mm`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteVesaSpec(deleting.id ?? 0)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
};

export default VesaSpecsAdmin;
