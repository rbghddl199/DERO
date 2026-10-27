// 관리자 책상 상판 재질 관리 — 목록·등록·수정(텍스처 맵 3종 업로드 포함)·삭제.
// 재질명은 부분 유니크(uq_desk_texture_name)라 중복 등록은 409로 거절된다(erd.md desk_texture).

'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import {
  createDeskTexture,
  deleteDeskTexture,
  listDeskTextures,
  updateDeskTexture,
  type DeskTextureResponse,
} from '@/api/admin/masters';
import DeskTextureMapUploader from '@/components/admin/masters/DeskTextureMapUploader';
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

interface DeskTextureValues {
  name: string;
  baseColor: string;
  roughness: number;
  metalness: number;
  tileSizeMm: number | null;
  displayOrder: number;
}

const DEFAULT_BASE_COLOR = '#8b6f4e';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** 0~1 사이, 소수점 둘째 자리까지 — DB가 NUMERIC(3,2)다 */
const UNIT_SCALAR_PATTERN = /^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/;

const NAME_HELP =
  '선택 화면에 보일 표시명입니다("월넛", "화이트"). 이미 있는 이름은 저장되지 않습니다.';
const BASE_COLOR_HELP =
  '#RRGGBB 표기의 기본 색입니다. 단색 재질의 정본이자 텍스처가 도착하기 전에 렌더할 폴백 색으로도 쓰입니다.';
const ROUGHNESS_HELP =
  '맵이 없을 때 쓰는 거칠기 스칼라입니다. 0~1 사이 소수 둘째 자리까지 (0에 가까울수록 매끈).';
const METALNESS_HELP =
  '금속성 스칼라입니다. 0~1 사이 소수 둘째 자리까지. 나무·도장 상판은 보통 0입니다.';
const TILE_SIZE_HELP =
  '텍스처 1장이 덮는 실제 폭을 mm 정수로 넣습니다. 환산식은 tile_size_mm = 해상도(px) ÷ 밀도(px/cm) × 10 — 2048px·37.2px/cm이면 551mm입니다. 단색 재질은 비워 둡니다.';
const DISPLAY_ORDER_HELP = '선택 UI 정렬 순서입니다. 작은 수가 먼저 나오고, 비워 두면 0입니다.';

type FormProps = {
  initialValues: {
    name: string;
    baseColor: string;
    roughness: string;
    metalness: string;
    tileSizeMm: string;
    displayOrder: string;
  };
  submitLabel: string;
  onSubmit: (values: DeskTextureValues) => Promise<void>;
  onCancel?: () => void;
  children?: ReactNode;
};

const DeskTextureForm = ({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: FormProps) => {
  const [name, setName] = useState(initialValues.name);
  const [baseColor, setBaseColor] = useState(initialValues.baseColor);
  const [roughness, setRoughness] = useState(initialValues.roughness);
  const [metalness, setMetalness] = useState(initialValues.metalness);
  const [tileSizeMm, setTileSizeMm] = useState(initialValues.tileSizeMm);
  const [displayOrder, setDisplayOrder] = useState(initialValues.displayOrder);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 파생 상태라 렌더 중에 계산한다
  const errors: {
    name?: string;
    baseColor?: string;
    roughness?: string;
    metalness?: string;
    tileSizeMm?: string;
    displayOrder?: string;
  } = {};
  if (!name.trim()) errors.name = '재질명을 입력해주세요.';
  if (!HEX_COLOR_PATTERN.test(baseColor.trim())) {
    errors.baseColor = '#RRGGBB 형식으로 입력해주세요. (예: #8b6f4e)';
  }
  if (!UNIT_SCALAR_PATTERN.test(roughness.trim())) {
    errors.roughness = '0~1 사이 소수 둘째 자리까지 입력해주세요.';
  }
  if (!UNIT_SCALAR_PATTERN.test(metalness.trim())) {
    errors.metalness = '0~1 사이 소수 둘째 자리까지 입력해주세요.';
  }
  if (tileSizeMm.trim() !== '' && !/^[1-9]\d*$/.test(tileSizeMm.trim())) {
    errors.tileSizeMm = '1 이상 mm 정수로 입력하거나 비워 두세요.';
  }
  if (displayOrder.trim() !== '' && !/^\d+$/.test(displayOrder.trim())) {
    errors.displayOrder = '0 이상 정수로 입력해주세요.';
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
        name: name.trim(),
        baseColor: baseColor.trim().toLowerCase(),
        roughness: Number(roughness.trim()),
        metalness: Number(metalness.trim()),
        tileSizeMm: tileSizeMm.trim() === '' ? null : Number(tileSizeMm.trim()),
        displayOrder: displayOrder.trim() === '' ? 0 : Number(displayOrder.trim()),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const colorPickerValue = HEX_COLOR_PATTERN.test(baseColor.trim())
    ? baseColor.trim()
    : DEFAULT_BASE_COLOR;

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      <MasterField label="재질명" help={NAME_HELP} isRequired errorMessage={visibleErrors.name}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          aria-invalid={visibleErrors.name ? true : undefined}
          className={visibleErrors.name ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS}
        />
      </MasterField>

      <MasterField
        label="기본 색"
        help={BASE_COLOR_HELP}
        isRequired
        errorMessage={visibleErrors.baseColor}
      >
        <span className="flex items-center gap-2">
          <input
            type="color"
            value={colorPickerValue}
            onChange={(event) => setBaseColor(event.target.value)}
            aria-label="기본 색 고르기"
            className="border-ash/40 size-10 shrink-0 cursor-pointer rounded-[10px] border bg-white p-1"
          />
          <input
            type="text"
            value={baseColor}
            onChange={(event) => setBaseColor(event.target.value)}
            maxLength={7}
            placeholder="#8b6f4e"
            aria-label="기본 색 HEX 값"
            aria-invalid={visibleErrors.baseColor ? true : undefined}
            className={visibleErrors.baseColor ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS}
          />
        </span>
      </MasterField>

      <MasterField
        label="러프니스"
        help={ROUGHNESS_HELP}
        isRequired
        errorMessage={visibleErrors.roughness}
      >
        <input
          type="text"
          inputMode="decimal"
          value={roughness}
          onChange={(event) => setRoughness(event.target.value)}
          placeholder="0.7"
          aria-invalid={visibleErrors.roughness ? true : undefined}
          className={`${visibleErrors.roughness ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
        />
      </MasterField>

      <MasterField
        label="메탈니스"
        help={METALNESS_HELP}
        isRequired
        errorMessage={visibleErrors.metalness}
      >
        <input
          type="text"
          inputMode="decimal"
          value={metalness}
          onChange={(event) => setMetalness(event.target.value)}
          placeholder="0"
          aria-invalid={visibleErrors.metalness ? true : undefined}
          className={`${visibleErrors.metalness ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
        />
      </MasterField>

      <MasterField
        label="타일 크기 (mm)"
        help={TILE_SIZE_HELP}
        errorMessage={visibleErrors.tileSizeMm}
      >
        <input
          type="text"
          inputMode="numeric"
          value={tileSizeMm}
          onChange={(event) => setTileSizeMm(event.target.value)}
          placeholder="551"
          aria-invalid={visibleErrors.tileSizeMm ? true : undefined}
          className={`${visibleErrors.tileSizeMm ? MASTER_INPUT_ERROR_CLASS : MASTER_INPUT_CLASS} tabular-nums`}
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

const DeskTexturesAdmin = () => {
  const { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload } =
    useMasterList<DeskTextureResponse>(listDeskTextures);
  const [editing, setEditing] = useState<DeskTextureResponse | null>(null);
  const [deleting, setDeleting] = useState<DeskTextureResponse | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);

  const handleCreate = async (values: DeskTextureValues): Promise<void> => {
    setSubmitErrorMessage(null);
    try {
      await createDeskTexture({
        name: values.name,
        baseColor: values.baseColor,
        roughness: values.roughness,
        metalness: values.metalness,
        tileSizeMm: values.tileSizeMm ?? undefined,
        displayOrder: values.displayOrder,
      });
      setCreateFormKey((key) => key + 1);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '재질을 등록하지 못했습니다.'));
    }
  };

  const handleUpdate = async (values: DeskTextureValues): Promise<void> => {
    if (editing?.id == null) return;
    setSubmitErrorMessage(null);
    try {
      await updateDeskTexture(editing.id, {
        name: values.name,
        baseColor: values.baseColor,
        roughness: values.roughness,
        metalness: values.metalness,
        tileSizeMm: values.tileSizeMm ?? undefined,
        displayOrder: values.displayOrder,
      });
      setEditing(null);
      reload();
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '재질을 수정하지 못했습니다.'));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">책상 재질</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        사용자가 고르는 상판 재질 선택지입니다. 상판은 치수 가변이라 텍스처를 월드 좌표로 입히므로,
        타일 크기(mm)가 나뭇결 굵기를 정합니다.
      </p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="border-ash/20 mt-8 rounded-2xl border p-6">
        <h2 className="text-ink text-[17px] font-semibold">새로 등록</h2>
        <p className="text-ash mt-1 text-[13px] leading-5">
          텍스처 맵(KTX2)은 재질을 먼저 등록한 뒤 목록의 “수정”에서 올립니다 — 업로드 주소를
          받으려면 재질 id가 있어야 합니다.
        </p>
        <div className="mt-4">
          <DeskTextureForm
            key={createFormKey}
            initialValues={{
              name: '',
              baseColor: DEFAULT_BASE_COLOR,
              roughness: '0.7',
              metalness: '0',
              tileSizeMm: '',
              displayOrder: '0',
            }}
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
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr>
                  <th className={MASTER_TABLE_HEAD_CLASS}>ID</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>재질명</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>기본 색</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>러프</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>메탈</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>타일 (mm)</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>맵</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>정렬</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((texture) => {
                  const mapCount = [texture.albedoKey, texture.roughnessKey, texture.normalKey]
                    .filter((key) => Boolean(key))
                    .length.toString();

                  return (
                    <tr key={texture.id}>
                      <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{texture.id}</td>
                      <td className={MASTER_TABLE_CELL_CLASS}>{texture.name}</td>
                      <td className={MASTER_TABLE_CELL_CLASS}>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: texture.baseColor ?? '#ffffff' }}
                            className="border-ash/40 inline-block size-5 rounded border"
                          />
                          <span className="text-ash tabular-nums">{texture.baseColor}</span>
                        </span>
                      </td>
                      <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                        {texture.roughness}
                      </td>
                      <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                        {texture.metalness}
                      </td>
                      <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                        {texture.tileSizeMm ?? '—'}
                      </td>
                      <td className={`${MASTER_TABLE_CELL_CLASS} text-ash tabular-nums`}>
                        {mapCount} / 3
                      </td>
                      <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>
                        {texture.displayOrder ?? 0}
                      </td>
                      <td className={MASTER_TABLE_CELL_CLASS}>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSubmitErrorMessage(null);
                              setEditing(texture);
                            }}
                            className={MASTER_GHOST_BUTTON_CLASS}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(texture)}
                            className={MASTER_DANGER_BUTTON_CLASS}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!isLoading && items.length === 0 ? (
              <p className="text-ash py-10 text-center text-[14px]">등록된 재질이 없습니다.</p>
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
        <MasterDialog title="책상 재질 수정" onClose={() => setEditing(null)}>
          <DeskTextureForm
            initialValues={{
              name: editing.name ?? '',
              baseColor: editing.baseColor ?? DEFAULT_BASE_COLOR,
              roughness: editing.roughness == null ? '' : String(editing.roughness),
              metalness: editing.metalness == null ? '' : String(editing.metalness),
              tileSizeMm: editing.tileSizeMm == null ? '' : String(editing.tileSizeMm),
              displayOrder: String(editing.displayOrder ?? 0),
            }}
            submitLabel="저장"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          >
            <DeskTextureMapUploader
              deskTextureId={editing.id}
              deskTexture={editing}
              onUploaded={reload}
            />
          </DeskTextureForm>
        </MasterDialog>
      ) : null}

      {deleting ? (
        <MasterDeleteDialog
          itemLabel={deleting.name ?? `#${deleting.id}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteDeskTexture(deleting.id ?? 0)}
          onDeleted={() => {
            setDeleting(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
};

export default DeskTexturesAdmin;
