// 관리자 제품 등록·수정 폼의 입력 초안 타입 — 입력 중에는 전부 문자열이고, 제출 직전에
// openapi 와이어 타입(XxxSpecRequest)으로 변환한다. boolean은 "미선택"을 표현해야 해서
// 3지 선택값(BooleanChoice)으로 들고 있다 — erd.md 전역 규칙("미입력이 '아니오'로 둔갑 금지").

import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

export type AdminProductCreateRequest = Schemas['AdminProductCreateRequest'];
export type AdminProductPatchRequest = Schemas['AdminProductPatchRequest'];
export type ProductDetailResponse = Schemas['ProductDetailResponse'];

export type DeskSpecRequest = Schemas['DeskSpecRequest'];
export type MonitorSpecRequest = Schemas['MonitorSpecRequest'];
export type ArmSpecRequest = Schemas['ArmSpecRequest'];
export type LightSpecRequest = Schemas['LightSpecRequest'];
export type PropSpecRequest = Schemas['PropSpecRequest'];

export type SpecType = AdminProductCreateRequest['specType'];
export type ProductStatus = NonNullable<AdminProductPatchRequest['status']>;
export type ProductSource = NonNullable<ProductDetailResponse['source']>;

export type FrameType = DeskSpecRequest['frameType'];
export type PanelShape = MonitorSpecRequest['panelShape'];
export type ArmKind = ArmSpecRequest['armKind'];
export type ArmType = ArmSpecRequest['armType'];
export type LightDistribution = NonNullable<LightSpecRequest['distribution']>;
export type MountSurface = PropSpecRequest['mountSurface'];

/** 기본값 없는 3지 선택 — 'unset'이면 제출을 막는다. */
export type BooleanChoice = 'unset' | 'yes' | 'no';

export type SelectOption = {
  value: string;
  label: string;
};

/** 필드명 → 오류 메시지. 없는 키는 통과다. */
export type FieldErrors = Record<string, string>;

export type CommonDraft = {
  specType: SpecType | '';
  brandId: string;
  categoryId: string;
  name: string;
  description: string;
  priceKrw: string;
  productUrl: string;
  status: ProductStatus;
  /** 지원 VESA 규격 id들 — product_vesa는 제품 레벨 다대다라 규격 서브타입이 아니라 공통에 둔다. */
  vesaSpecIds: string[];
};

export type DeskSpecDraft = {
  widthMm: string;
  depthMm: string;
  heightMm: string;
  topThicknessMm: string;
  edgeThicknessMm: string;
  isRounded: BooleanChoice;
  deskTextureId: string;
  frameType: FrameType | '';
  allowedLoadG: string;
};

export type MonitorSpecDraft = {
  diagonalInch: string;
  aspectWidth: string;
  aspectHeight: string;
  bezelMm: string;
  panelThicknessMm: string;
  panelShape: PanelShape | '';
  curvatureRadiusMm: string;
  standDepthMm: string;
  isStandDetachable: BooleanChoice;
  isPivotSupported: BooleanChoice;
  swivelMaxDeg: string;
  heightAdjustRangeMm: string;
  tiltMinDeg: string;
  tiltMaxDeg: string;
  weightG: string;
  /** 쉼표로 구분해 입력받고 문자열 배열로 보낸다(표시 전용). */
  ports: string;
};

export type ArmSpecDraft = {
  armKind: ArmKind | '';
  armType: ArmType | '';
  deviceCapacity: string;
  segmentCount: string;
  poleHeightMm: string;
  reachMinMm: string;
  reachMaxMm: string;
  heightMinMm: string;
  heightMaxMm: string;
  isClampMountable: BooleanChoice;
  isGrommetMountable: BooleanChoice;
  isWallMountable: BooleanChoice;
  clampMinMm: string;
  clampMaxMm: string;
  tiltMinDeg: string;
  tiltMaxDeg: string;
  swivelRangeDeg: string;
  pivotRangeDeg: string;
  isVesaPlateDetachable: BooleanChoice;
  hasCableManagement: BooleanChoice;
  allowedLoadG: string;
};

export type LightSpecDraft = {
  widthMm: string;
  depthMm: string;
  heightMm: string;
  isColorTemperatureAdjustable: BooleanChoice;
  colorTemperatureMinK: string;
  colorTemperatureMaxK: string;
  isBrightnessAdjustable: BooleanChoice;
  luminousFluxMinLm: string;
  luminousFluxMaxLm: string;
  distribution: LightDistribution | '';
  reachMm: string;
};

export type PropSpecDraft = {
  widthMm: string;
  depthMm: string;
  heightMm: string;
  weightG: string;
  isStackable: BooleanChoice;
  mountSurface: MountSurface | '';
};

/** 규격 타입을 바꿔도 이미 입력한 값이 날아가지 않도록 5종을 모두 들고 있는다. */
export type SpecDrafts = {
  desk: DeskSpecDraft;
  monitor: MonitorSpecDraft;
  arm: ArmSpecDraft;
  light: LightSpecDraft;
  prop: PropSpecDraft;
};

export type ProductFormDraft = {
  common: CommonDraft;
  specs: SpecDrafts;
};
