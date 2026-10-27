// 이름만(또는 이름 + 설명) 가진 마스터 화면 — 무드(vibe)와 해시태그가 함께 쓴다.
// 두 테이블은 컬럼이 name(+description)뿐이라 화면 흐름이 완전히 같다(erd.md §4 분류 태그).

'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import type { OffsetPageParams, PageInfo } from '@/api/admin/masters';
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

export interface NameMasterItem {
  id?: number;
  name?: string;
  description?: string;
}

interface NameMasterValues {
  name: string;
  description: string;
}

type Props = {
  title: string;
  pageDescription: string;
  nameHelp: string;
  /** description 컬럼이 있는 테이블(해시태그)만 true — 무드는 name 한 칸뿐이다 */
  hasDescription: boolean;
  descriptionHelp?: string;
  /** 참조가 안정적인 모듈 함수를 넘긴다(useMasterList 주석 참고) */
  list: (params: OffsetPageParams) => Promise<{ content?: NameMasterItem[]; page?: PageInfo }>;
  create: (values: NameMasterValues) => Promise<unknown>;
  update: (id: number, values: NameMasterValues) => Promise<unknown>;
  remove: (id: number) => Promise<void>;
};

type FormProps = {
  initialValues: NameMasterValues;
  hasDescription: boolean;
  nameHelp: string;
  descriptionHelp: string;
  submitLabel: string;
  onSubmit: (values: NameMasterValues) => Promise<void>;
  onCancel?: () => void;
};

const NameMasterForm = ({
  initialValues,
  hasDescription,
  nameHelp,
  descriptionHelp,
  submitLabel,
  onSubmit,
  onCancel,
}: FormProps) => {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파생 상태라 렌더 중에 계산한다(CollectionUploadForm과 같은 관례)
  const errors: { name?: string } = {};
  if (!name.trim()) errors.name = '이름을 입력해주세요.';
  const isValid = Object.keys(errors).length === 0;
  const visibleErrors = hasAttemptedSubmit ? errors : {};

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
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
      <MasterField label="이름" help={nameHelp} isRequired errorMessage={visibleErrors.name}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          aria-invalid={visibleErrors.name ? true : undefined}
          className={visibleErrors.name ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS}
        />
      </MasterField>

      {hasDescription ? (
        <MasterField label="설명" help={descriptionHelp}>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={255}
            className={MASTER_INPUT_CLASS}
          />
        </MasterField>
      ) : null}

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

const NameMasterAdmin = ({
  title,
  pageDescription,
  nameHelp,
  hasDescription,
  descriptionHelp = '',
  list,
  create,
  update,
  remove,
}: Props) => {
  const { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload } =
    useMasterList<NameMasterItem>(list);
  const [editing, setEditing] = useState<NameMasterItem | null>(null);
  const [deleting, setDeleting] = useState<NameMasterItem | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  // 등록 성공 뒤 폼을 비우기 위한 key — 폼이 자기 입력 상태를 들고 있어 리마운트로 초기화한다
  const [createFormKey, setCreateFormKey] = useState(0);

  const handleCreate = async (values: NameMasterValues): Promise<void> => {
    setSubmitErrorMessage(null);
    try {
      await create(values);
      setCreateFormKey((key) => key + 1);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '등록하지 못했습니다.'));
    }
  };

  const handleUpdate = async (values: NameMasterValues): Promise<void> => {
    if (editing?.id == null) return;
    setSubmitErrorMessage(null);
    try {
      await update(editing.id, values);
      setEditing(null);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '수정하지 못했습니다.'));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">{title}</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">{pageDescription}</p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="border-ash/20 mt-8 rounded-2xl border p-6">
        <h2 className="text-ink text-[17px] font-semibold">새로 등록</h2>
        <div className="mt-4">
          <NameMasterForm
            key={createFormKey}
            initialValues={{ name: '', description: '' }}
            hasDescription={hasDescription}
            nameHelp={nameHelp}
            descriptionHelp={descriptionHelp}
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
                  <th className={MASTER_TABLE_HEAD_CLASS}>이름</th>
                  {hasDescription ? <th className={MASTER_TABLE_HEAD_CLASS}>설명</th> : null}
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{item.id}</td>
                    <td className={MASTER_TABLE_CELL_CLASS}>{item.name}</td>
                    {hasDescription ? (
                      <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                        {item.description ?? '—'}
                      </td>
                    ) : null}
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitErrorMessage(null);
                            setEditing(item);
                          }}
                          className={MASTER_GHOST_BUTTON_CLASS}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(item)}
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
              <p className="text-ash py-10 text-center text-[14px]">등록된 항목이 없습니다.</p>
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
        <MasterDialog title={`${title} 수정`} onClose={() => setEditing(null)}>
          <NameMasterForm
            initialValues={{ name: editing.name ?? '', description: editing.description ?? '' }}
            hasDescription={hasDescription}
            nameHelp={nameHelp}
            descriptionHelp={descriptionHelp}
            submitLabel="저장"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        </MasterDialog>
      ) : null}

      {deleting ? (
        <MasterDeleteDialog
          itemLabel={deleting.name ?? `#${deleting.id}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting.id ?? 0)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
};

export default NameMasterAdmin;
