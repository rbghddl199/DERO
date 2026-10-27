// 관리자 브랜드 관리 — offset 목록·등록·수정(로고 업로드 포함)·삭제.
// 브랜드명은 부분 유니크(uq_brand_name, deleted_at IS NULL)라 중복 등록은 409로 거절된다.

'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import {
  createBrand,
  deleteBrand,
  listBrands,
  updateBrand,
  type BrandResponse,
} from '@/api/admin/masters';
import BrandLogoUploader from '@/components/admin/masters/BrandLogoUploader';
import MasterDeleteDialog from '@/components/admin/masters/MasterDeleteDialog';
import MasterDialog from '@/components/admin/masters/MasterDialog';
import MasterField from '@/components/admin/masters/MasterField';
import MasterPagination from '@/components/admin/masters/MasterPagination';
import SearchReindexButton from '@/components/admin/masters/SearchReindexButton';
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

interface BrandValues {
  name: string;
  description: string;
  brandUrl: string;
}

const NAME_HELP =
  '브랜드 공식 표기 그대로 씁니다. 이미 등록된 이름이면 저장되지 않습니다(같은 이름이 두 행으로 갈리면 제품 필터가 반으로 쪼개집니다).';
const DESCRIPTION_HELP = '브랜드를 한두 문장으로 소개합니다. 제품 상세에서 참고용으로 씁니다.';
const BRAND_URL_HELP = '브랜드 공식 사이트 주소입니다. https:// 부터 그대로 붙여 넣으세요.';

type FormProps = {
  initialValues: BrandValues;
  submitLabel: string;
  onSubmit: (values: BrandValues) => Promise<void>;
  onCancel?: () => void;
  children?: ReactNode;
};

const BrandForm = ({ initialValues, submitLabel, onSubmit, onCancel, children }: FormProps) => {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [brandUrl, setBrandUrl] = useState(initialValues.brandUrl);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파생 상태라 렌더 중에 계산한다
  const errors: { name?: string } = {};
  if (!name.trim()) errors.name = '브랜드명을 입력해주세요.';
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
        name: name.trim(),
        description: description.trim(),
        brandUrl: brandUrl.trim(),
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
      <MasterField label="브랜드명" help={NAME_HELP} isRequired errorMessage={visibleErrors.name}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          aria-invalid={visibleErrors.name ? true : undefined}
          className={visibleErrors.name ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS}
        />
      </MasterField>

      <MasterField label="설명" help={DESCRIPTION_HELP}>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className={`${MASTER_INPUT_CLASS} resize-none`}
        />
      </MasterField>

      <MasterField label="공식 사이트" help={BRAND_URL_HELP}>
        <input
          type="url"
          value={brandUrl}
          onChange={(event) => setBrandUrl(event.target.value)}
          maxLength={2048}
          placeholder="https://"
          className={MASTER_INPUT_CLASS}
        />
      </MasterField>

      {children}

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

const BrandsAdmin = () => {
  const { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload } =
    useMasterList<BrandResponse>(listBrands);
  const [editing, setEditing] = useState<BrandResponse | null>(null);
  const [deleting, setDeleting] = useState<BrandResponse | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);

  const handleCreate = async (values: BrandValues): Promise<void> => {
    setSubmitErrorMessage(null);
    try {
      await createBrand({
        name: values.name,
        description: values.description || undefined,
        brandUrl: values.brandUrl || undefined,
      });
      setCreateFormKey((key) => key + 1);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '브랜드를 등록하지 못했습니다.'));
    }
  };

  const handleUpdate = async (values: BrandValues): Promise<void> => {
    if (editing?.id == null) return;
    setSubmitErrorMessage(null);
    try {
      await updateBrand(editing.id, {
        name: values.name,
        description: values.description,
        brandUrl: values.brandUrl,
      });
      setEditing(null);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '브랜드를 수정하지 못했습니다.'));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">브랜드</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        제품에 붙는 브랜드 마스터입니다. 제품이 참조 중인 브랜드는 삭제되지 않습니다.
      </p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="border-ash/20 mt-8 rounded-2xl border p-6">
        <h2 className="text-ink text-[17px] font-semibold">새로 등록</h2>
        <p className="text-ash mt-1 text-[13px] leading-5">
          로고 이미지는 브랜드를 먼저 등록한 뒤 목록의 “수정”에서 올립니다 — 업로드 주소를 받으려면
          브랜드 id가 있어야 합니다.
        </p>
        <div className="mt-4">
          <BrandForm
            key={createFormKey}
            initialValues={{ name: '', description: '', brandUrl: '' }}
            submitLabel="등록"
            onSubmit={handleCreate}
          />
        </div>
      </section>

      <SearchReindexButton />

      <section className="mt-8">
        {loadErrorMessage ? (
          <InlineNotice variant="error" message={loadErrorMessage} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={MASTER_TABLE_HEAD_CLASS}>ID</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>브랜드명</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>설명</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>공식 사이트</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>로고</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((brand) => (
                  <tr key={brand.id}>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{brand.id}</td>
                    <td className={MASTER_TABLE_CELL_CLASS}>{brand.name}</td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                      {brand.description ?? '—'}
                    </td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash break-all`}>
                      {brand.brandUrl ?? '—'}
                    </td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                      {brand.logoImageKey ? '등록됨' : '없음'}
                    </td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitErrorMessage(null);
                            setEditing(brand);
                          }}
                          className={MASTER_GHOST_BUTTON_CLASS}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(brand)}
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
              <p className="text-ash py-10 text-center text-[14px]">등록된 브랜드가 없습니다.</p>
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
        <MasterDialog title="브랜드 수정" onClose={() => setEditing(null)}>
          <BrandForm
            initialValues={{
              name: editing.name ?? '',
              description: editing.description ?? '',
              brandUrl: editing.brandUrl ?? '',
            }}
            submitLabel="저장"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          >
            <BrandLogoUploader
              brandId={editing.id}
              currentLogoImageKey={editing.logoImageKey ?? null}
              onUploaded={reload}
            />
          </BrandForm>
        </MasterDialog>
      ) : null}

      {deleting ? (
        <MasterDeleteDialog
          itemLabel={deleting.name ?? `#${deleting.id}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteBrand(deleting.id ?? 0)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
};

export default BrandsAdmin;
