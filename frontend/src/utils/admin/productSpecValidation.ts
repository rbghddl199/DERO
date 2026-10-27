// 관리자 제품 폼 검증 — 서버 422 규칙(erd.md §3 규격 슈퍼/서브)을 화면에서 먼저 잡는다.
// 규칙 셋: ①mm·g·K는 정수 ②boolean 미선택은 제출 차단 ③조건부 필드(FLAT 곡률, MIC 피벗 등).

import type {
  ArmSpecDraft,
  BooleanChoice,
  CommonDraft,
  DeskSpecDraft,
  FieldErrors,
  LightSpecDraft,
  MonitorSpecDraft,
  PropSpecDraft,
  SpecType,
} from '@/types/admin/productForm';

const POSITIVE_INTEGER = /^\d+$/;
const SIGNED_INTEGER = /^-?\d+$/;
/** inch는 소수 1자리까지 — NUMERIC(4,1). */
const INCH_DECIMAL = /^\d+(\.\d)?$/;

const BOOLEAN_UNSET_MESSAGE = '예 또는 아니오를 선택하세요. 미선택은 저장할 수 없습니다.';

const isBlank = (value: string): boolean => value.trim() === '';

/** 필수 양의 정수(mm·g·K·개수) — 빈칸도 소수점도 막는다. */
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

/** 각도는 음수가 있을 수 있다(아래로 5도 = -5). */
const optionalSignedInteger = (value: string): string | null => {
  if (isBlank(value)) return null;
  if (!SIGNED_INTEGER.test(value.trim())) return '정수로 입력하세요. 음수는 -5처럼 씁니다.';
  return null;
};

const requiredChoice = (value: string, label: string): string | null =>
  value === '' ? `${label}을(를) 선택하세요.` : null;

const requiredBoolean = (value: BooleanChoice): string | null =>
  value === 'unset' ? BOOLEAN_UNSET_MESSAGE : null;

/** null이 아닌 항목만 오류 맵에 담는다. */
const collect = (entries: [string, string | null][]): FieldErrors => {
  const errors: FieldErrors = {};
  for (const [field, message] of entries) {
    if (message !== null) {
      errors[field] = message;
    }
  }
  return errors;
};

export const validateCommon = (draft: CommonDraft, isCreateMode: boolean): FieldErrors => {
  const errors = collect([
    ['specType', requiredChoice(draft.specType, '규격 타입')],
    ['name', isBlank(draft.name) ? '제품명을 입력하세요.' : null],
    ['brandId', requiredChoice(draft.brandId, '브랜드')],
    ['categoryId', requiredChoice(draft.categoryId, '카테고리')],
    ['priceKrw', requiredPositiveInteger(draft.priceKrw, '가격')],
    ['productUrl', isBlank(draft.productUrl) ? '구매처 링크를 입력하세요.' : null],
  ]);

  // 수정 모드에서 빈칸은 "유지"라 필수 검사에서 뺀다 — NULL로 되돌리는 수단이 없다.
  if (!isCreateMode) {
    for (const field of ['brandId', 'categoryId', 'priceKrw', 'productUrl'] as const) {
      if (isBlank(draft[field])) {
        delete errors[field];
      }
    }
    if (isBlank(draft.name)) {
      delete errors.name;
    }
  }

  return errors;
};

export const validateDeskSpec = (draft: DeskSpecDraft): FieldErrors =>
  collect([
    ['widthMm', requiredPositiveInteger(draft.widthMm, '상판 가로')],
    ['depthMm', requiredPositiveInteger(draft.depthMm, '상판 깊이')],
    ['heightMm', requiredPositiveInteger(draft.heightMm, '높이')],
    ['topThicknessMm', requiredPositiveInteger(draft.topThicknessMm, '상판 두께')],
    ['edgeThicknessMm', requiredPositiveInteger(draft.edgeThicknessMm, '엣지 두께')],
    ['isRounded', requiredBoolean(draft.isRounded)],
    ['deskTextureId', requiredChoice(draft.deskTextureId, '상판 재질')],
    ['frameType', requiredChoice(draft.frameType, '프레임 형태')],
    ['allowedLoadG', optionalPositiveInteger(draft.allowedLoadG)],
  ]);

export const validateMonitorSpec = (draft: MonitorSpecDraft): FieldErrors => {
  const errors = collect([
    [
      'diagonalInch',
      isBlank(draft.diagonalInch)
        ? '대각 화면 크기를 입력하세요.'
        : INCH_DECIMAL.test(draft.diagonalInch.trim())
          ? null
          : '소수점 첫째 자리까지만 입력하세요. (예: 27, 34.5)',
    ],
    ['aspectWidth', requiredPositiveInteger(draft.aspectWidth, '화면비 가로 항')],
    ['aspectHeight', requiredPositiveInteger(draft.aspectHeight, '화면비 세로 항')],
    ['bezelMm', requiredPositiveInteger(draft.bezelMm, '베젤 폭')],
    ['panelThicknessMm', optionalPositiveInteger(draft.panelThicknessMm)],
    ['panelShape', requiredChoice(draft.panelShape, '패널 형태')],
    ['standDepthMm', requiredPositiveInteger(draft.standDepthMm, '스탠드 발판 깊이')],
    ['isStandDetachable', requiredBoolean(draft.isStandDetachable)],
    ['isPivotSupported', requiredBoolean(draft.isPivotSupported)],
    ['swivelMaxDeg', optionalSignedInteger(draft.swivelMaxDeg)],
    ['heightAdjustRangeMm', optionalPositiveInteger(draft.heightAdjustRangeMm)],
    ['tiltMinDeg', optionalSignedInteger(draft.tiltMinDeg)],
    ['tiltMaxDeg', optionalSignedInteger(draft.tiltMaxDeg)],
    ['weightG', requiredPositiveInteger(draft.weightG, '무게')],
  ]);

  // 곡률은 곡면일 때만 존재한다 — 평면인데 값이 남아 있으면 서버가 422로 막는다.
  if (draft.panelShape === 'CURVED') {
    const message = optionalPositiveInteger(draft.curvatureRadiusMm);
    if (message !== null) {
      errors.curvatureRadiusMm = message;
    }
  }

  return errors;
};

export const validateArmSpec = (draft: ArmSpecDraft): FieldErrors => {
  const isStand = draft.armType === 'STAND';
  const isMic = draft.armKind === 'MIC';

  const errors = collect([
    ['armKind', requiredChoice(draft.armKind, '거치 대상')],
    ['armType', requiredChoice(draft.armType, '구조 분류')],
    ['deviceCapacity', requiredPositiveInteger(draft.deviceCapacity, '거치 가능 대수')],
    ['segmentCount', optionalPositiveInteger(draft.segmentCount)],
    ['poleHeightMm', optionalPositiveInteger(draft.poleHeightMm)],
    ['reachMinMm', optionalPositiveInteger(draft.reachMinMm)],
    ['reachMaxMm', optionalPositiveInteger(draft.reachMaxMm)],
    ['heightMinMm', optionalPositiveInteger(draft.heightMinMm)],
    ['heightMaxMm', optionalPositiveInteger(draft.heightMaxMm)],
    ['clampMinMm', optionalPositiveInteger(draft.clampMinMm)],
    ['clampMaxMm', optionalPositiveInteger(draft.clampMaxMm)],
    ['tiltMinDeg', optionalSignedInteger(draft.tiltMinDeg)],
    ['tiltMaxDeg', optionalSignedInteger(draft.tiltMaxDeg)],
    ['swivelRangeDeg', optionalPositiveInteger(draft.swivelRangeDeg)],
    ['hasCableManagement', requiredBoolean(draft.hasCableManagement)],
    ['allowedLoadG', requiredPositiveInteger(draft.allowedLoadG, '허용 하중')],
  ]);

  // 자립형은 마운트 3종이 전부 false로 고정돼 입력 자체를 잠근다(erd.md WAS 검증 규칙).
  if (!isStand) {
    const mountErrors = collect([
      ['isClampMountable', requiredBoolean(draft.isClampMountable)],
      ['isGrommetMountable', requiredBoolean(draft.isGrommetMountable)],
      ['isWallMountable', requiredBoolean(draft.isWallMountable)],
    ]);
    Object.assign(errors, mountErrors);
  }

  // 마이크암은 화면 피벗·VESA 플레이트 개념이 없어 두 필드를 잠근다(erd.md WAS 검증 규칙).
  if (!isMic) {
    const monitorOnlyErrors = collect([
      ['pivotRangeDeg', optionalPositiveInteger(draft.pivotRangeDeg)],
      ['isVesaPlateDetachable', requiredBoolean(draft.isVesaPlateDetachable)],
    ]);
    Object.assign(errors, monitorOnlyErrors);
  }

  return errors;
};

export const validateLightSpec = (draft: LightSpecDraft): FieldErrors =>
  collect([
    ['widthMm', requiredPositiveInteger(draft.widthMm, '가로')],
    ['depthMm', requiredPositiveInteger(draft.depthMm, '깊이')],
    ['heightMm', requiredPositiveInteger(draft.heightMm, '높이')],
    ['isColorTemperatureAdjustable', requiredBoolean(draft.isColorTemperatureAdjustable)],
    ['colorTemperatureMinK', optionalPositiveInteger(draft.colorTemperatureMinK)],
    ['colorTemperatureMaxK', optionalPositiveInteger(draft.colorTemperatureMaxK)],
    ['isBrightnessAdjustable', requiredBoolean(draft.isBrightnessAdjustable)],
    ['luminousFluxMinLm', optionalPositiveInteger(draft.luminousFluxMinLm)],
    ['luminousFluxMaxLm', optionalPositiveInteger(draft.luminousFluxMaxLm)],
    ['reachMm', optionalPositiveInteger(draft.reachMm)],
  ]);

export const validatePropSpec = (draft: PropSpecDraft): FieldErrors =>
  collect([
    ['widthMm', requiredPositiveInteger(draft.widthMm, '가로')],
    ['depthMm', requiredPositiveInteger(draft.depthMm, '깊이')],
    ['heightMm', requiredPositiveInteger(draft.heightMm, '높이')],
    ['weightG', optionalPositiveInteger(draft.weightG)],
    ['isStackable', requiredBoolean(draft.isStackable)],
    ['mountSurface', requiredChoice(draft.mountSurface, '놓을 수 있는 표면')],
  ]);

export const validateSpec = (
  specType: SpecType,
  specs: {
    desk: DeskSpecDraft;
    monitor: MonitorSpecDraft;
    arm: ArmSpecDraft;
    light: LightSpecDraft;
    prop: PropSpecDraft;
  },
): FieldErrors => {
  if (specType === 'DESK') return validateDeskSpec(specs.desk);
  if (specType === 'MONITOR') return validateMonitorSpec(specs.monitor);
  if (specType === 'ARM') return validateArmSpec(specs.arm);
  if (specType === 'LIGHT') return validateLightSpec(specs.light);
  return validatePropSpec(specs.prop);
};
