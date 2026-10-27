// 관리자 에셋·발광 폼 검증 — 서버 422 규칙(erd.md `asset`·`product_emitter`)을 화면에서 먼저
// 잡는다. 규칙 셋: ①조건부 필수(finish는 PART_SEG 전용, distribution은 SPOT 전용)
// ②boolean 미선택 차단 ③point_*_mm은 셋 다 or 셋 다 비움.

import type { AssetDraft, EmitterDraft } from '@/types/admin/asset';
import type { FieldErrors } from '@/types/admin/productForm';

const POSITIVE_INTEGER = /^\d+$/;
const SIGNED_INTEGER = /^-?\d+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isBlank = (value: string): boolean => value.trim() === '';

const requiredPositiveInteger = (value: string, label: string): string | null => {
  if (isBlank(value)) return `${label}을(를) 입력하세요.`;
  if (!POSITIVE_INTEGER.test(value.trim())) return '0 이상 정수로 입력하세요.';
  return null;
};

const optionalPositiveInteger = (value: string): string | null => {
  if (isBlank(value)) return null;
  if (!POSITIVE_INTEGER.test(value.trim())) return '0 이상 정수로 입력하세요.';
  return null;
};

/** null이 아닌 항목만 오류 맵에 담는다(productSpecValidation과 같은 규약). */
const collect = (entries: [string, string | null][]): FieldErrors => {
  const errors: FieldErrors = {};
  for (const [field, message] of entries) {
    if (message !== null) {
      errors[field] = message;
    }
  }
  return errors;
};

export function validateAsset(draft: AssetDraft): FieldErrors {
  const isPartSegmentation = draft.glbExportMode === 'PART_SEGMENTATION';
  const isTexture = draft.glbExportMode === 'TEXTURE';

  let finishError: string | null = null;
  if (isPartSegmentation && draft.finish === '') {
    finishError = '파트 분리 GLB는 텍스처가 없어 재질 프리셋이 필수입니다.';
  } else if (isTexture && draft.finish !== '') {
    finishError = '텍스처 융합 GLB는 재질 정본이 GLB 안이라 프리셋을 비워야 합니다.';
  }

  return collect([
    ['glbExportMode', draft.glbExportMode === '' ? 'GLB export 모드를 선택하세요.' : null],
    ['finish', finishError],
    ['polygonCount', optionalPositiveInteger(draft.polygonCount)],
  ]);
}

export function validateEmitter(draft: EmitterDraft): FieldErrors {
  const isSpot = draft.shape === 'SPOT';
  const isPoint = draft.shape === 'POINT';

  let distributionError: string | null = null;
  if (isSpot && draft.distribution === '') {
    distributionError = 'SPOT은 원뿔 각을 고를 배광 프리셋이 필수입니다.';
  } else if (isPoint && draft.distribution !== '') {
    distributionError = 'POINT는 사방으로 뿌려서 조일 원뿔이 없습니다. 배광을 비우세요.';
  }

  const point = [draft.pointXMm, draft.pointYMm, draft.pointZMm];
  const filled = point.filter((value) => !isBlank(value)).length;
  const isPointPartial = filled !== 0 && filled !== 3;
  const partialMessage = 'X·Y·Z를 셋 다 채우거나 셋 다 비우세요. 비우면 bbox 중심을 씁니다.';

  const pointError = (value: string): string | null => {
    if (isPointPartial) return partialMessage;
    if (isBlank(value)) return null;
    if (!SIGNED_INTEGER.test(value.trim())) return '정수 mm로 입력하세요. 음수는 -12처럼 씁니다.';
    return null;
  };

  let colorError: string | null = null;
  if (isBlank(draft.defaultColor)) {
    colorError = '기본 발광색을 입력하세요.';
  } else if (!HEX_COLOR.test(draft.defaultColor.trim())) {
    colorError = '#RRGGBB 6자리로 입력하세요. (예: #ffd9a0)';
  }

  return collect([
    ['shape', draft.shape === '' ? '발광 형태를 선택하세요.' : null],
    ['distribution', distributionError],
    ['lumens', requiredPositiveInteger(draft.lumens, '저작 기준 광속')],
    ['radiusMm', requiredPositiveInteger(draft.radiusMm, '도달 반경')],
    [
      'recolorable',
      draft.recolorable === 'unset'
        ? '예 또는 아니오를 선택하세요. 미선택은 저장할 수 없습니다.'
        : null,
    ],
    ['defaultColor', colorError],
    ['pointXMm', pointError(draft.pointXMm)],
    ['pointYMm', pointError(draft.pointYMm)],
    ['pointZMm', pointError(draft.pointZMm)],
  ]);
}
