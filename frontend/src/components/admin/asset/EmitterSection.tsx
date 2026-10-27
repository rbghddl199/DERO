'use client';
// 제품 발광 섹션 — product_emitter 1:1 저작. 발광은 spec_type과 직교하므로 조명이든 PC 본체
// RGB든 같은 폼을 쓴다. 렌더가 읽는 정본이 여기고, light 규격의 광학 컬럼은 카탈로그 표기다.
// 조명 GLB가 있으면 light_origin 노드를 읽어 point_*_mm를 자동으로 채울 수 있다.

import { useState } from 'react';

import { registerProductEmitter, removeProductEmitter } from '@/api/admin/assets';
import {
  BooleanField,
  NumberField,
  SelectField,
} from '@/components/admin/products/ProductFormFields';
import InlineNotice from '@/components/common/InlineNotice';
import {
  DEFAULT_EMITTER_COLOR,
  EMITTER_DISTRIBUTION_OPTIONS,
  EMITTER_SHAPE_OPTIONS,
  EMPTY_EMITTER_DRAFT,
} from '@/constants/admin/asset';
import type { PointMm } from '@/three/core/lightAuthoring';
import type { EmitterDraft, EmitterShape, ProductEmitterResponse } from '@/types/admin/asset';
import { buildEmitterPayload, emitterDraftFromDetail } from '@/utils/admin/assetDraft';
import { validateEmitter } from '@/utils/admin/assetValidation';
import DynamicAssetLightProbe from './DynamicAssetLightProbe';
import DynamicEmitterPreview from './DynamicEmitterPreview';

type Props = {
  productId: number;
  /** 서버에 저장돼 있는 값. 행이 없으면 undefined다(빛을 내지 않는 제품). */
  emitter: ProductEmitterResponse | undefined;
  /** 등록된 GLB의 presigned URL. 없으면 좌표 자동 추출을 열 수 없다. */
  glbUrl: string | null;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
};

const toMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** 색만 공용 조각이 없어 여기서 만든다 — 텍스트(#RRGGBB)와 색상 피커가 같은 값을 가리킨다. */
const ColorField = ({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor="emitter-defaultColor" className="text-ink text-[15px] font-semibold">
      기본 발광색
      <span className="text-danger-500" aria-hidden="true">
        {' '}
        *
      </span>
    </label>
    <div className="flex items-center gap-2">
      <input
        id="emitter-defaultColor"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        placeholder={DEFAULT_EMITTER_COLOR}
        className={`bg-paper text-ink placeholder:text-ash w-full rounded-[10px] border px-4 py-2.5 text-[15px] outline-none ${
          error ? 'border-danger-500' : 'border-ash/40'
        }`}
      />
      <input
        type="color"
        aria-label="색상 선택기"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_EMITTER_COLOR}
        onChange={(event) => onChange(event.target.value)}
        className="border-ash/40 size-11 shrink-0 cursor-pointer rounded-[10px] border"
      />
    </div>
    <p className="text-ash text-[13px] leading-5">
      #RRGGBB 6자리입니다. 색을 못 고르는 제품에서는 이 값이 곧 최종색이고, 고를 수 있는 제품에서는
      초기값입니다.
    </p>
    {error ? (
      <p role="alert" className="text-danger-700 text-[13px] leading-5">
        {error}
      </p>
    ) : null}
  </div>
);

const EmitterSection = ({ productId, emitter, glbUrl, onSaved, onToast }: Props) => {
  // 마운트 시점에 한 번만 편다 — 저장 후 상세를 다시 읽어도 입력 중인 초안을 덮지 않는다.
  const [draft, setDraft] = useState<EmitterDraft>(() => emitterDraftFromDetail(emitter));
  const [hasEmitter, setHasEmitter] = useState(emitter != null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isProbeOpen, setIsProbeOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 파생 상태라 렌더 중에 계산한다(CollectionUploadForm과 같은 방식).
  const errors = validateEmitter(draft);
  const visibleErrors = hasAttemptedSubmit ? errors : {};
  const isValid = Object.keys(errors).length === 0;
  const isSpot = draft.shape === 'SPOT';

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await registerProductEmitter(productId, buildEmitterPayload(draft));
      setHasEmitter(true);
      await onSaved();
      onToast('발광 설정을 저장했습니다.');
    } catch (error) {
      setSubmitError(toMessage(error, '발광 설정 저장 중 오류가 발생했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await removeProductEmitter(productId);
      setDraft(EMPTY_EMITTER_DRAFT);
      setHasEmitter(false);
      setHasAttemptedSubmit(false);
      await onSaved();
      onToast('발광 설정을 삭제했습니다.');
    } catch (error) {
      setSubmitError(toMessage(error, '발광 설정 삭제 중 오류가 발생했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShapeChange = (value: string) => {
    const shape = (value === '' ? '' : value) as EmitterShape | '';
    setDraft((prev) => ({
      ...prev,
      shape,
      // POINT는 사방으로 뿌려서 조일 원뿔이 없다 — 배광을 비운다(erd.md `product_emitter`).
      distribution: shape === 'SPOT' ? prev.distribution : '',
    }));
  };

  const handleApplyPoint = (point: PointMm) => {
    setDraft((prev) => ({
      ...prev,
      pointXMm: String(point.point_x_mm),
      pointYMm: String(point.point_y_mm),
      pointZMm: String(point.point_z_mm),
    }));
    onToast('light_origin 좌표를 발광 지점에 채웠습니다.');
  };

  return (
    <section
      id="emitter"
      aria-labelledby="admin-product-emitter-heading"
      className="border-ash/20 mt-6 rounded-2xl border p-6"
    >
      <h2 id="admin-product-emitter-heading" className="text-ink text-[19px] font-semibold">
        발광 설정 (product_emitter)
      </h2>
      <p className="text-ash mt-1 text-[13px] leading-5">
        제품당 발광체 하나입니다. 빛을 내지 않는 제품은 저장하지 않고 그대로 두면 됩니다. 여기 값이
        렌더 정본이고, 조명 규격의 색온도·정격 광속은 제품 상세에 찍히는 카탈로그 표기입니다.
      </p>

      {!hasEmitter ? (
        <p className="border-ash/30 text-ash mt-4 rounded-[10px] border border-dashed px-4 py-6 text-center text-[14px]">
          발광 없음 — 아직 저장된 발광 설정이 없습니다.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
        <SelectField
          id="emitter-shape"
          label="발광 형태"
          isRequired
          value={draft.shape}
          error={visibleErrors.shape}
          options={EMITTER_SHAPE_OPTIONS}
          onChange={handleShapeChange}
          help="POINT는 사방으로 뿌리고 그림자 배정에서 빠집니다(큐브맵이라 씬을 여섯 번 그려야 합니다). 갓으로 원뿔을 쏘는 스탠드·데스크램프는 SPOT입니다."
        />
        <SelectField
          id="emitter-distribution"
          label="배광 프리셋"
          value={draft.distribution}
          error={visibleErrors.distribution}
          options={EMITTER_DISTRIBUTION_OPTIONS}
          isDisabled={!isSpot}
          onChange={(value) =>
            setDraft((prev) => ({ ...prev, distribution: value as EmitterDraft['distribution'] }))
          }
          help="SPOT일 때만 고릅니다. 원뿔 각·penumbra 수치는 코드가 정본이라 여기선 프리셋 이름 하나만 고릅니다."
        />
        <NumberField
          id="emitter-lumens"
          label="저작 기준 광속"
          unit="lm"
          isRequired
          value={draft.lumens}
          error={visibleErrors.lumens}
          onChange={(value) => setDraft((prev) => ({ ...prev, lumens: value }))}
          help="사용자 밝기 배율을 곱하기 전의 값입니다. 루멘으로 고정해야 카메라 노출 캘리브레이션 한 번이 신규 제품에도 그대로 먹습니다."
        />
        <NumberField
          id="emitter-radiusMm"
          label="도달 반경"
          unit="mm"
          isRequired
          value={draft.radiusMm}
          error={visibleErrors.radiusMm}
          onChange={(value) => setDraft((prev) => ({ ...prev, radiusMm: value }))}
          help="빛이 닿는 거리의 컷오프입니다. 조명 규격의 '정격 도달 거리'(카탈로그 표기)와는 다른 값입니다."
        />
        <BooleanField
          id="emitter-recolorable"
          label="색 변경 가능"
          value={draft.recolorable}
          error={visibleErrors.recolorable}
          onChange={(value) => setDraft((prev) => ({ ...prev, recolorable: value }))}
          help="사용자가 색을 고를 수 있는지입니다. 미선택 금지 — '아니오'로 둔갑하면 색을 고를 수 있는 제품에서 색 선택 UI가 아예 안 뜨고, 사용자는 왜 안 뜨는지 알 방법이 없습니다."
        />
        <ColorField
          value={draft.defaultColor}
          error={visibleErrors.defaultColor}
          onChange={(value) => setDraft((prev) => ({ ...prev, defaultColor: value }))}
        />
      </div>

      <div className="border-ash/20 mt-6 border-t pt-6">
        <h3 className="text-ink text-[17px] font-semibold">발광 지점 (제품 로컬 좌표)</h3>
        <p className="text-ash mt-1 text-[13px] leading-5">
          셋 다 채우거나 셋 다 비웁니다. 비우면 런타임이 bbox 중심을 씁니다 —
          모니터라이트·스크린바처럼 제품 전체가 발광 바인 제품은 그게 맞지만, 갓이 있는 램프는 bbox
          중심이 폴대 중간이라 조용히 틀리므로 반드시 채워야 합니다.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-5">
          <NumberField
            id="emitter-pointXMm"
            label="발광 지점 X"
            unit="mm"
            value={draft.pointXMm}
            error={visibleErrors.pointXMm}
            onChange={(value) => setDraft((prev) => ({ ...prev, pointXMm: value }))}
            help="제품 로컬 원점 기준 좌우입니다. mm 정수, 음수 가능."
          />
          <NumberField
            id="emitter-pointYMm"
            label="발광 지점 Y"
            unit="mm"
            value={draft.pointYMm}
            error={visibleErrors.pointYMm}
            onChange={(value) => setDraft((prev) => ({ ...prev, pointYMm: value }))}
            help="바닥에서의 높이입니다. 갓 안쪽 위에 오도록 잡습니다."
          />
          <NumberField
            id="emitter-pointZMm"
            label="발광 지점 Z"
            unit="mm"
            value={draft.pointZMm}
            error={visibleErrors.pointZMm}
            onChange={(value) => setDraft((prev) => ({ ...prev, pointZMm: value }))}
            help="앞뒤 방향입니다. 발광면 위에 두면 글로우 한가운데 핫스팟이 박히니 살짝 안쪽에 둡니다."
          />
        </div>

        {glbUrl === null ? (
          <p className="text-ash mt-4 text-[13px] leading-5">
            등록된 GLB가 없어 좌표를 자동으로 읽을 수 없습니다. GLB를 먼저 등록하면 light_origin
            노드에서 값을 뽑을 수 있습니다.
          </p>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsProbeOpen((open) => !open)}
              className="border-ash/30 text-ink cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
            >
              {isProbeOpen ? '조명 GLB 판정 닫기' : 'GLB에서 light_origin 읽기'}
            </button>
            <p className="text-ash mt-1.5 text-[13px] leading-5">
              GLB를 열어 light_origin 노드 좌표를 mm 정수로 변환하고, lampShade 갓이 빔을 실제로
              깎는지 함께 판정합니다. 갓 경고는 등록을 막지 않습니다.
            </p>
          </div>
        )}

        {isProbeOpen && glbUrl !== null ? (
          <DynamicAssetLightProbe
            glbUrl={glbUrl}
            sourceLabel="등록된 에셋"
            distribution={draft.distribution}
            onApplyPoint={handleApplyPoint}
          />
        ) : null}
      </div>

      <div className="border-ash/20 mt-6 border-t pt-6">
        <h3 className="text-ink text-[17px] font-semibold">발광 미리보기</h3>
        <p className="text-ash mt-1 text-[13px] leading-5">
          위 값이 실제로 어떻게 보이는지 3D로 확인합니다. 시뮬레이터와 같은 조명 리그·노출·블룸을
          씁니다 — 여기서 눈으로 고른 광속·색이 시뮬레이터에서도 같습니다. 저장하지 않아도 입력하는
          즉시 반영됩니다. 위 &ldquo;조명 GLB 판정&rdquo;과는 답하는 질문이 다릅니다(판정은
          &ldquo;노드가 있나&rdquo;, 미리보기는 &ldquo;어떻게 보이나&rdquo;).
        </p>

        {glbUrl === null ? (
          <p className="text-ash mt-4 text-[13px] leading-5">
            등록된 GLB가 없어 미리보기를 열 수 없습니다. GLB를 먼저 등록하세요.
          </p>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsPreviewOpen((open) => !open)}
              className="border-ash/30 text-ink cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
            >
              {isPreviewOpen ? '발광 미리보기 닫기' : '발광 미리보기 열기'}
            </button>
          </div>
        )}

        {isPreviewOpen && glbUrl !== null ? (
          <DynamicEmitterPreview glbUrl={glbUrl} draft={draft} />
        ) : null}
      </div>

      {hasAttemptedSubmit && !isValid ? (
        <div className="mt-6">
          <InlineNotice
            variant="error"
            message="입력하지 않았거나 형식이 맞지 않는 항목이 있습니다. 위에서 빨간 안내가 붙은 칸을 확인하세요."
          />
        </div>
      ) : null}

      {submitError !== null ? (
        <div className="mt-4">
          <InlineNotice variant="error" title="발광 설정 저장 실패" message={submitError} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-3">
        {hasEmitter ? (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isSubmitting}
            className="border-ash/20 text-danger-700 min-w-[140px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-[16px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            발광 삭제
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper min-w-[140px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '저장하는 중...' : '발광 저장'}
        </button>
      </div>
    </section>
  );
};

export default EmitterSection;
