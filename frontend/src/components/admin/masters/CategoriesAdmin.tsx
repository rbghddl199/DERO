// 관리자 카테고리 관리 — 트리(상위 들여쓰기) 표시·등록·수정·삭제.
// 마스터 6종 중 유일하게 이름 중복 검사가 없다 — 부모가 다르면 같은 이름이 정당하다(erd.md category).

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type CategoryResponse,
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
import { buildCategoryTree, collectSelfAndDescendantIds } from '@/utils/admin/categoryTree';

/** 상위 셀렉트·들여쓰기 계산에 쓰는 전체 목록 — 표는 페이지 단위지만 트리는 전체를 알아야 한다. */
const ALL_CATEGORIES_SIZE = 500;

interface CategoryValues {
  parentId: number | null;
  name: string;
  description: string;
  displayOrder: number;
}

const NAME_HELP =
  '분류 이름입니다. 상위가 다르면 같은 이름을 써도 됩니다("모니터 > 27인치", "책상 > 1200mm").';
const DESCRIPTION_HELP = '이 분류가 무엇을 담는지 한 줄로 적습니다. 비워도 됩니다.';
const DISPLAY_ORDER_HELP =
  '같은 상위 안에서의 정렬 순서입니다. 작은 수가 먼저 나오고, 비워 두면 0입니다.';
const PARENT_CREATE_HELP =
  '이 분류가 들어갈 상위를 고릅니다. 고르지 않으면 루트(최상위) 분류가 됩니다.';
const PARENT_EDIT_HELP =
  '옮길 상위를 고릅니다. 자기 자신과 자기 하위 분류는 목록에 나오지 않습니다(사이클이 생깁니다). 지금은 루트로 다시 끌어올릴 수 없습니다 — 상위를 비워 저장하면 "바꾸지 않음"으로 처리됩니다.';

type FormProps = {
  initialValues: CategoryValues;
  /** 상위 셀렉트에 넣을 후보 — 수정 모달에서는 자기 자신·하위가 이미 빠져 있다 */
  parentOptions: { id: number; label: string }[];
  parentHelp: string;
  submitLabel: string;
  onSubmit: (values: CategoryValues) => Promise<void>;
  onCancel?: () => void;
};

const CategoryForm = ({
  initialValues,
  parentOptions,
  parentHelp,
  submitLabel,
  onSubmit,
  onCancel,
}: FormProps) => {
  const [parentId, setParentId] = useState<string>(
    initialValues.parentId === null ? '' : String(initialValues.parentId),
  );
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [displayOrder, setDisplayOrder] = useState(String(initialValues.displayOrder));
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파생 상태라 렌더 중에 계산한다
  const errors: { name?: string; displayOrder?: string } = {};
  if (!name.trim()) errors.name = '분류 이름을 입력해주세요.';
  if (displayOrder.trim() !== '' && !/^\d+$/.test(displayOrder.trim())) {
    errors.displayOrder = '정렬 순서는 0 이상 정수로 입력해주세요.';
  }
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
      await onSubmit({
        parentId: parentId === '' ? null : Number(parentId),
        name: name.trim(),
        description: description.trim(),
        displayOrder: displayOrder.trim() === '' ? 0 : Number(displayOrder.trim()),
      });
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
      <MasterField label="상위 분류" help={parentHelp}>
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className={MASTER_INPUT_CLASS}
        >
          <option value="">(상위 없음 · 루트)</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      </MasterField>

      <MasterField label="분류 이름" help={NAME_HELP} isRequired errorMessage={visibleErrors.name}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          aria-invalid={visibleErrors.name ? true : undefined}
          className={visibleErrors.name ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS}
        />
      </MasterField>

      <MasterField label="설명" help={DESCRIPTION_HELP}>
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={255}
          className={MASTER_INPUT_CLASS}
        />
      </MasterField>

      <MasterField
        label="정렬 순서"
        help={DISPLAY_ORDER_HELP}
        errorMessage={visibleErrors.displayOrder}
      >
        <input
          type="text"
          inputMode="numeric"
          value={displayOrder}
          onChange={(event) => setDisplayOrder(event.target.value)}
          placeholder="0"
          aria-invalid={visibleErrors.displayOrder ? true : undefined}
          className={`${visibleErrors.displayOrder ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
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

const CategoriesAdmin = () => {
  const { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload } =
    useMasterList<CategoryResponse>(listCategories);
  const [allCategories, setAllCategories] = useState<CategoryResponse[]>([]);
  const [allCategoriesToken, setAllCategoriesToken] = useState(0);
  const [editing, setEditing] = useState<CategoryResponse | null>(null);
  const [deleting, setDeleting] = useState<CategoryResponse | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    listCategories({ page: 0, size: ALL_CATEGORIES_SIZE })
      .then((response) => {
        if (isCurrent) setAllCategories(response.content ?? []);
      })
      .catch(() => {
        // 상위 셀렉트·들여쓰기용 보조 조회다 — 실패해도 표는 목록 조회 결과로 그대로 뜬다.
        if (isCurrent) setAllCategories([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [allCategoriesToken]);

  const refresh = useCallback(() => {
    reload();
    setAllCategoriesToken((token) => token + 1);
  }, [reload]);

  // 파생 값이라 렌더 중에 계산한다
  const treeNodes = buildCategoryTree(allCategories);
  const depthById = new Map(
    treeNodes.map((node) => [node.category.id, node.depth] as [number | undefined, number]),
  );
  // <option>은 앞쪽 일반 공백을 접어 버리므로 들여쓰기에 nbsp( )를 쓴다
  const labelById = new Map(
    treeNodes.map(
      (node) =>
        [node.category.id, `${'  '.repeat(node.depth)}${node.category.name ?? ''}`] as [
          number | undefined,
          string,
        ],
    ),
  );

  const buildParentOptions = (excludedIds: Set<number>): { id: number; label: string }[] =>
    treeNodes
      .filter((node) => node.category.id != null && !excludedIds.has(node.category.id))
      .map((node) => ({
        id: node.category.id ?? 0,
        label: labelById.get(node.category.id) ?? node.category.name ?? '',
      }));

  const handleCreate = async (values: CategoryValues): Promise<void> => {
    setSubmitErrorMessage(null);
    try {
      await createCategory({
        parentId: values.parentId ?? undefined,
        name: values.name,
        description: values.description || undefined,
        displayOrder: values.displayOrder,
      });
      setCreateFormKey((key) => key + 1);
      refresh();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '카테고리를 등록하지 못했습니다.'));
    }
  };

  const handleUpdate = async (values: CategoryValues): Promise<void> => {
    if (editing?.id == null) return;
    setSubmitErrorMessage(null);
    try {
      // parentId를 안 보내면 서버가 상위를 그대로 둔다 — null은 "루트로 올린다"가 아니다.
      await updateCategory(editing.id, {
        parentId: values.parentId ?? undefined,
        name: values.name,
        description: values.description,
        displayOrder: values.displayOrder,
      });
      setEditing(null);
      refresh();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '카테고리를 수정하지 못했습니다.'));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">카테고리</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        제품 탐색용 분류 트리입니다. 제품이 참조 중이거나 하위 분류가 남아 있으면 삭제되지 않습니다.
      </p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="border-ash/20 mt-8 rounded-2xl border p-6">
        <h2 className="text-ink text-[17px] font-semibold">새로 등록</h2>
        <div className="mt-4">
          <CategoryForm
            key={createFormKey}
            initialValues={{ parentId: null, name: '', description: '', displayOrder: 0 }}
            parentOptions={buildParentOptions(new Set())}
            parentHelp={PARENT_CREATE_HELP}
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
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={MASTER_TABLE_HEAD_CLASS}>ID</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>분류</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>상위</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>설명</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>정렬</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((category) => (
                  <tr key={category.id}>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{category.id}</td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <span
                        style={{ paddingLeft: `${(depthById.get(category.id) ?? 0) * 16}px` }}
                        className="inline-block"
                      >
                        {(depthById.get(category.id) ?? 0) > 0 ? (
                          <span className="text-ash" aria-hidden="true">
                            └{' '}
                          </span>
                        ) : null}
                        {category.name}
                      </span>
                    </td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                      {/* 루트는 서버가 parentId를 null로 준다 — ??로 undefined와 함께 접는다 */}
                      {(category.parentId ?? null) === null
                        ? '(루트)'
                        : (allCategories.find((item) => item.id === category.parentId)?.name ??
                          `#${category.parentId}`)}
                    </td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                      {category.description ?? '—'}
                    </td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                      {category.displayOrder ?? 0}
                    </td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitErrorMessage(null);
                            setEditing(category);
                          }}
                          className={MASTER_GHOST_BUTTON_CLASS}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(category)}
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
              <p className="text-ash py-10 text-center text-[14px]">등록된 카테고리가 없습니다.</p>
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

      {editing?.id != null ? (
        <MasterDialog title="카테고리 수정" onClose={() => setEditing(null)}>
          <CategoryForm
            initialValues={{
              parentId: editing.parentId ?? null,
              name: editing.name ?? '',
              description: editing.description ?? '',
              displayOrder: editing.displayOrder ?? 0,
            }}
            parentOptions={buildParentOptions(
              collectSelfAndDescendantIds(allCategories, editing.id),
            )}
            parentHelp={PARENT_EDIT_HELP}
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
          onConfirm={() => deleteCategory(deleting.id ?? 0)}
          onDeleted={() => {
            setDeleting(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
};

export default CategoriesAdmin;
