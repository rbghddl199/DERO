// 관리자 제품 폼의 초안 변환 순수 함수 — 상세 응답 → 입력 초안, 입력 초안 → 요청 본문.
// 상세(GET /products/{id})의 규격 필드가 XxxSpecRequest와 같은 모양이라 그대로 되감을 수 있다.

import { EMPTY_SPEC_DRAFTS } from '@/constants/admin/productForm';
import type {
  ArmSpecDraft,
  ArmSpecRequest,
  BooleanChoice,
  DeskSpecDraft,
  DeskSpecRequest,
  LightSpecDraft,
  LightSpecRequest,
  MonitorSpecDraft,
  MonitorSpecRequest,
  ProductDetailResponse,
  ProductFormDraft,
  PropSpecDraft,
  PropSpecRequest,
  SpecType,
} from '@/types/admin/productForm';

/** 숫자를 입력칸 문자열로 되돌린다 — 값이 없으면 빈칸(= 미입력)이다. */
const numberToText = (value: number | undefined): string =>
  value === undefined || value === null ? '' : String(value);

const booleanToChoice = (value: boolean | undefined): BooleanChoice => {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unset';
};

/** 빈칸은 "보내지 않음"이다 — 0으로 치환하지 않는다(erd.md 결측 취급 규칙). */
const textToOptionalNumber = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value);

const textToNumber = (value: string): number => Number(value);

const choiceToBoolean = (value: BooleanChoice): boolean => value === 'yes';

// 셀렉트의 빈 값은 검증(productSpecValidation)이 이미 막는다. 여기서 임의의 기본값으로
// 대체하면 고르지 않은 값이 조용히 저장되므로 좁히기만 하고 대체하지 않는다.
const requireChoice = <T extends string>(value: T | ''): T => {
  if (value === '') {
    throw new Error('선택하지 않은 값이 제출되었습니다.');
  }
  return value;
};

export const deskDraftFromSpec = (spec: DeskSpecRequest): DeskSpecDraft => ({
  widthMm: numberToText(spec.widthMm),
  depthMm: numberToText(spec.depthMm),
  heightMm: numberToText(spec.heightMm),
  topThicknessMm: numberToText(spec.topThicknessMm),
  edgeThicknessMm: numberToText(spec.edgeThicknessMm),
  isRounded: booleanToChoice(spec.isRounded),
  deskTextureId: numberToText(spec.deskTextureId),
  frameType: spec.frameType ?? '',
  allowedLoadG: numberToText(spec.allowedLoadG),
});

export const monitorDraftFromSpec = (spec: MonitorSpecRequest): MonitorSpecDraft => ({
  diagonalInch: numberToText(spec.diagonalInch),
  aspectWidth: numberToText(spec.aspectWidth),
  aspectHeight: numberToText(spec.aspectHeight),
  bezelMm: numberToText(spec.bezelMm),
  panelThicknessMm: numberToText(spec.panelThicknessMm),
  panelShape: spec.panelShape ?? '',
  curvatureRadiusMm: numberToText(spec.curvatureRadiusMm),
  standDepthMm: numberToText(spec.standDepthMm),
  isStandDetachable: booleanToChoice(spec.isStandDetachable),
  isPivotSupported: booleanToChoice(spec.isPivotSupported),
  swivelMaxDeg: numberToText(spec.swivelMaxDeg),
  heightAdjustRangeMm: numberToText(spec.heightAdjustRangeMm),
  tiltMinDeg: numberToText(spec.tiltMinDeg),
  tiltMaxDeg: numberToText(spec.tiltMaxDeg),
  weightG: numberToText(spec.weightG),
  ports: (spec.ports ?? []).join(', '),
});

export const armDraftFromSpec = (spec: ArmSpecRequest): ArmSpecDraft => ({
  armKind: spec.armKind ?? '',
  armType: spec.armType ?? '',
  deviceCapacity: numberToText(spec.deviceCapacity),
  segmentCount: numberToText(spec.segmentCount),
  poleHeightMm: numberToText(spec.poleHeightMm),
  reachMinMm: numberToText(spec.reachMinMm),
  reachMaxMm: numberToText(spec.reachMaxMm),
  heightMinMm: numberToText(spec.heightMinMm),
  heightMaxMm: numberToText(spec.heightMaxMm),
  isClampMountable: booleanToChoice(spec.isClampMountable),
  isGrommetMountable: booleanToChoice(spec.isGrommetMountable),
  isWallMountable: booleanToChoice(spec.isWallMountable),
  clampMinMm: numberToText(spec.clampMinMm),
  clampMaxMm: numberToText(spec.clampMaxMm),
  tiltMinDeg: numberToText(spec.tiltMinDeg),
  tiltMaxDeg: numberToText(spec.tiltMaxDeg),
  swivelRangeDeg: numberToText(spec.swivelRangeDeg),
  pivotRangeDeg: numberToText(spec.pivotRangeDeg),
  isVesaPlateDetachable: booleanToChoice(spec.isVesaPlateDetachable),
  hasCableManagement: booleanToChoice(spec.hasCableManagement),
  allowedLoadG: numberToText(spec.allowedLoadG),
});

export const lightDraftFromSpec = (spec: LightSpecRequest): LightSpecDraft => ({
  widthMm: numberToText(spec.widthMm),
  depthMm: numberToText(spec.depthMm),
  heightMm: numberToText(spec.heightMm),
  isColorTemperatureAdjustable: booleanToChoice(spec.isColorTemperatureAdjustable),
  colorTemperatureMinK: numberToText(spec.colorTemperatureMinK),
  colorTemperatureMaxK: numberToText(spec.colorTemperatureMaxK),
  isBrightnessAdjustable: booleanToChoice(spec.isBrightnessAdjustable),
  luminousFluxMinLm: numberToText(spec.luminousFluxMinLm),
  luminousFluxMaxLm: numberToText(spec.luminousFluxMaxLm),
  distribution: spec.distribution ?? '',
  reachMm: numberToText(spec.reachMm),
});

export const propDraftFromSpec = (spec: PropSpecRequest): PropSpecDraft => ({
  widthMm: numberToText(spec.widthMm),
  depthMm: numberToText(spec.depthMm),
  heightMm: numberToText(spec.heightMm),
  weightG: numberToText(spec.weightG),
  isStackable: booleanToChoice(spec.isStackable),
  mountSurface: spec.mountSurface ?? '',
});

/** 상세 응답을 폼 초안으로 되감는다 — 없는 규격은 빈 초안 그대로 둔다. */
export const draftFromDetail = (detail: ProductDetailResponse): ProductFormDraft => ({
  common: {
    specType: detail.specType ?? '',
    brandId: numberToText(detail.brandId),
    categoryId: numberToText(detail.categoryId),
    name: detail.name ?? '',
    description: detail.description ?? '',
    priceKrw: numberToText(detail.priceKrw),
    productUrl: detail.productUrl ?? '',
    status: detail.status ?? 'ACTIVE',
    vesaSpecIds: (detail.vesaSpecs ?? [])
      .map((spec) => spec.id)
      .filter((id): id is number => id != null)
      .map(String),
  },
  specs: {
    desk: detail.desk ? deskDraftFromSpec(detail.desk) : EMPTY_SPEC_DRAFTS.desk,
    monitor: detail.monitor ? monitorDraftFromSpec(detail.monitor) : EMPTY_SPEC_DRAFTS.monitor,
    arm: detail.arm ? armDraftFromSpec(detail.arm) : EMPTY_SPEC_DRAFTS.arm,
    light: detail.light ? lightDraftFromSpec(detail.light) : EMPTY_SPEC_DRAFTS.light,
    prop: detail.prop ? propDraftFromSpec(detail.prop) : EMPTY_SPEC_DRAFTS.prop,
  },
});

export const buildDeskSpec = (draft: DeskSpecDraft): DeskSpecRequest => ({
  widthMm: textToNumber(draft.widthMm),
  depthMm: textToNumber(draft.depthMm),
  heightMm: textToNumber(draft.heightMm),
  topThicknessMm: textToNumber(draft.topThicknessMm),
  edgeThicknessMm: textToNumber(draft.edgeThicknessMm),
  isRounded: choiceToBoolean(draft.isRounded),
  deskTextureId: textToNumber(draft.deskTextureId),
  frameType: requireChoice(draft.frameType),
  allowedLoadG: textToOptionalNumber(draft.allowedLoadG),
});

export const buildMonitorSpec = (draft: MonitorSpecDraft): MonitorSpecRequest => {
  const isFlat = draft.panelShape === 'FLAT';
  const ports = draft.ports
    .split(',')
    .map((port) => port.trim())
    .filter((port) => port.length > 0);

  return {
    diagonalInch: textToNumber(draft.diagonalInch),
    aspectWidth: textToNumber(draft.aspectWidth),
    aspectHeight: textToNumber(draft.aspectHeight),
    bezelMm: textToNumber(draft.bezelMm),
    panelThicknessMm: textToOptionalNumber(draft.panelThicknessMm),
    panelShape: requireChoice(draft.panelShape),
    // 평면 모니터는 곡률이 존재하지 않는다 — 입력이 남아 있어도 보내지 않는다(erd.md monitor).
    curvatureRadiusMm: isFlat ? undefined : textToOptionalNumber(draft.curvatureRadiusMm),
    standDepthMm: textToNumber(draft.standDepthMm),
    isStandDetachable: choiceToBoolean(draft.isStandDetachable),
    isPivotSupported: choiceToBoolean(draft.isPivotSupported),
    swivelMaxDeg: textToOptionalNumber(draft.swivelMaxDeg),
    heightAdjustRangeMm: textToOptionalNumber(draft.heightAdjustRangeMm),
    tiltMinDeg: textToOptionalNumber(draft.tiltMinDeg),
    tiltMaxDeg: textToOptionalNumber(draft.tiltMaxDeg),
    weightG: textToNumber(draft.weightG),
    ports: ports.length === 0 ? undefined : ports,
  };
};

export const buildArmSpec = (draft: ArmSpecDraft): ArmSpecRequest => {
  const isMic = draft.armKind === 'MIC';
  const isStand = draft.armType === 'STAND';

  return {
    armKind: requireChoice(draft.armKind),
    armType: requireChoice(draft.armType),
    deviceCapacity: textToNumber(draft.deviceCapacity),
    segmentCount: textToOptionalNumber(draft.segmentCount),
    poleHeightMm: textToOptionalNumber(draft.poleHeightMm),
    reachMinMm: textToOptionalNumber(draft.reachMinMm),
    reachMaxMm: textToOptionalNumber(draft.reachMaxMm),
    heightMinMm: textToOptionalNumber(draft.heightMinMm),
    heightMaxMm: textToOptionalNumber(draft.heightMaxMm),
    // 자립형은 상판·벽에 고정하지 않는다 — 마운트 3종을 강제로 false로 보낸다(erd.md WAS 검증 규칙).
    isClampMountable: isStand ? false : choiceToBoolean(draft.isClampMountable),
    isGrommetMountable: isStand ? false : choiceToBoolean(draft.isGrommetMountable),
    isWallMountable: isStand ? false : choiceToBoolean(draft.isWallMountable),
    clampMinMm: textToOptionalNumber(draft.clampMinMm),
    clampMaxMm: textToOptionalNumber(draft.clampMaxMm),
    tiltMinDeg: textToOptionalNumber(draft.tiltMinDeg),
    tiltMaxDeg: textToOptionalNumber(draft.tiltMaxDeg),
    swivelRangeDeg: textToOptionalNumber(draft.swivelRangeDeg),
    // 마이크암엔 화면 피벗 개념이 없다 — NULL로 보낸다(erd.md WAS 검증 규칙).
    pivotRangeDeg: isMic ? undefined : textToOptionalNumber(draft.pivotRangeDeg),
    isVesaPlateDetachable: isMic ? false : choiceToBoolean(draft.isVesaPlateDetachable),
    hasCableManagement: choiceToBoolean(draft.hasCableManagement),
    allowedLoadG: textToNumber(draft.allowedLoadG),
  };
};

export const buildLightSpec = (draft: LightSpecDraft): LightSpecRequest => ({
  widthMm: textToNumber(draft.widthMm),
  depthMm: textToNumber(draft.depthMm),
  heightMm: textToNumber(draft.heightMm),
  isColorTemperatureAdjustable: choiceToBoolean(draft.isColorTemperatureAdjustable),
  colorTemperatureMinK: textToOptionalNumber(draft.colorTemperatureMinK),
  colorTemperatureMaxK: textToOptionalNumber(draft.colorTemperatureMaxK),
  isBrightnessAdjustable: choiceToBoolean(draft.isBrightnessAdjustable),
  luminousFluxMinLm: textToOptionalNumber(draft.luminousFluxMinLm),
  luminousFluxMaxLm: textToOptionalNumber(draft.luminousFluxMaxLm),
  distribution: draft.distribution === '' ? undefined : draft.distribution,
  reachMm: textToOptionalNumber(draft.reachMm),
});

export const buildPropSpec = (draft: PropSpecDraft): PropSpecRequest => ({
  widthMm: textToNumber(draft.widthMm),
  depthMm: textToNumber(draft.depthMm),
  heightMm: textToNumber(draft.heightMm),
  weightG: textToOptionalNumber(draft.weightG),
  isStackable: choiceToBoolean(draft.isStackable),
  mountSurface: requireChoice(draft.mountSurface),
});

/** VESA 태깅을 가질 수 있는 규격 타입 — 나머지 타입에 vesaSpecIds를 실어 보내면
 *  WAS가 422(PRODUCT_VESA_NOT_APPLICABLE)로 거절한다. */
export const supportsVesaSpecs = (specType: SpecType | ''): boolean =>
  specType === 'MONITOR' || specType === 'ARM';

/** 태깅은 집합이라 순서가 달라도 같은 값이다 — 정렬 사본을 비교해 바뀐 경우에만 보낸다.
 *  PATCH에서 빈 배열은 "전부 해제"라 안 보내는 것(= 유지)과 반드시 구분해야 한다. */
export const vesaSpecIdsPatch = (
  current: readonly string[],
  initial: readonly string[],
): number[] | undefined => {
  const sortedCurrent = [...current].sort();
  const sortedInitial = [...initial].sort();
  const isUnchanged =
    sortedCurrent.length === sortedInitial.length &&
    sortedCurrent.every((id, index) => id === sortedInitial[index]);

  return isUnchanged ? undefined : current.map(Number);
};

/** 생성·수정 요청에 실리는 규격 슬롯 5종 — 고른 하나만 채운다. */
export type SpecPayload = {
  desk?: DeskSpecRequest;
  monitor?: MonitorSpecRequest;
  arm?: ArmSpecRequest;
  light?: LightSpecRequest;
  prop?: PropSpecRequest;
};

/** 고른 규격 하나만 요청 본문에 실린다 — 나머지 4종은 입력이 남아 있어도 보내지 않는다. */
export const buildSpecPayload = (
  specType: SpecType,
  specs: ProductFormDraft['specs'],
): SpecPayload => {
  if (specType === 'DESK') return { desk: buildDeskSpec(specs.desk) };
  if (specType === 'MONITOR') return { monitor: buildMonitorSpec(specs.monitor) };
  if (specType === 'ARM') return { arm: buildArmSpec(specs.arm) };
  if (specType === 'LIGHT') return { light: buildLightSpec(specs.light) };
  return { prop: buildPropSpec(specs.prop) };
};
