// 관리자 제품 폼의 고정 목록·상한값 — 규격 열거는 openapi 와이어 타입에서 파생한 값만 쓴다.

import type {
  ArmSpecDraft,
  DeskSpecDraft,
  LightSpecDraft,
  MonitorSpecDraft,
  ProductFormDraft,
  PropSpecDraft,
  SelectOption,
  SpecDrafts,
  SpecType,
} from '@/types/admin/productForm';

/** 규격 타입 → 초안 슬롯 이름. 요청 본문의 키(desk·monitor…)와 같은 이름이다. */
export const SPEC_DRAFT_KEY: Record<SpecType, keyof SpecDrafts> = {
  DESK: 'desk',
  MONITOR: 'monitor',
  ARM: 'arm',
  LIGHT: 'light',
  PROP: 'prop',
};

/** erd.md `product_image` — "제품당 상한 8장은 WAS가 강제한다"(REQ-REC-06). */
export const MAX_PRODUCT_IMAGES = 8;

/** 브랜드·카테고리·상판 재질 셀렉트가 한 번에 받아 오는 마스터 개수(첫 페이지만 쓴다). */
export const MASTER_OPTION_PAGE_SIZE = 200;

export const SPEC_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: 'DESK', label: '책상 (DESK)' },
  { value: 'MONITOR', label: '모니터 (MONITOR)' },
  { value: 'ARM', label: '모니터암·마이크암 (ARM)' },
  { value: 'LIGHT', label: '조명 (LIGHT)' },
  { value: 'PROP', label: '소품 (PROP)' },
];

export const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: 'ACTIVE', label: '노출 (ACTIVE)' },
  { value: 'HIDDEN', label: '숨김 (HIDDEN)' },
];

export const FRAME_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: 'T_FRAME', label: 'T자 프레임 (T_FRAME)' },
  { value: 'FOUR_LEG', label: '4다리 (FOUR_LEG)' },
  { value: 'TOP_ONLY', label: '상판만 (TOP_ONLY)' },
];

export const PANEL_SHAPE_OPTIONS: readonly SelectOption[] = [
  { value: 'FLAT', label: '평면 (FLAT)' },
  { value: 'CURVED', label: '곡면 (CURVED)' },
];

export const ARM_KIND_OPTIONS: readonly SelectOption[] = [
  { value: 'MONITOR', label: '모니터암 (MONITOR)' },
  { value: 'MIC', label: '마이크암 (MIC)' },
];

export const ARM_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: 'POLE', label: '폴형 (POLE)' },
  { value: 'ARTICULATED', label: '다관절 (ARTICULATED)' },
  { value: 'STAND', label: '자립형 (STAND)' },
];

export const DISTRIBUTION_OPTIONS: readonly SelectOption[] = [
  { value: 'SPOT', label: '집중형 (SPOT)' },
  { value: 'FLOOD', label: '확산형 (FLOOD)' },
  { value: 'AMBIENT', label: '간접광 (AMBIENT)' },
];

export const MOUNT_SURFACE_OPTIONS: readonly SelectOption[] = [
  { value: 'TOP', label: '상판 (TOP)' },
  { value: 'PEGBOARD', label: '타공판 (PEGBOARD)' },
  { value: 'WALL', label: '벽 (WALL)' },
  { value: 'FLOOR', label: '바닥 (FLOOR)' },
];

const EMPTY_DESK_DRAFT: DeskSpecDraft = {
  widthMm: '',
  depthMm: '',
  heightMm: '',
  topThicknessMm: '',
  edgeThicknessMm: '',
  isRounded: 'unset',
  deskTextureId: '',
  frameType: '',
  allowedLoadG: '',
};

const EMPTY_MONITOR_DRAFT: MonitorSpecDraft = {
  diagonalInch: '',
  aspectWidth: '',
  aspectHeight: '',
  bezelMm: '',
  panelThicknessMm: '',
  panelShape: '',
  curvatureRadiusMm: '',
  standDepthMm: '',
  isStandDetachable: 'unset',
  isPivotSupported: 'unset',
  swivelMaxDeg: '',
  heightAdjustRangeMm: '',
  tiltMinDeg: '',
  tiltMaxDeg: '',
  weightG: '',
  ports: '',
};

const EMPTY_ARM_DRAFT: ArmSpecDraft = {
  armKind: '',
  armType: '',
  deviceCapacity: '',
  segmentCount: '',
  poleHeightMm: '',
  reachMinMm: '',
  reachMaxMm: '',
  heightMinMm: '',
  heightMaxMm: '',
  isClampMountable: 'unset',
  isGrommetMountable: 'unset',
  isWallMountable: 'unset',
  clampMinMm: '',
  clampMaxMm: '',
  tiltMinDeg: '',
  tiltMaxDeg: '',
  swivelRangeDeg: '',
  pivotRangeDeg: '',
  isVesaPlateDetachable: 'unset',
  hasCableManagement: 'unset',
  allowedLoadG: '',
};

const EMPTY_LIGHT_DRAFT: LightSpecDraft = {
  widthMm: '',
  depthMm: '',
  heightMm: '',
  isColorTemperatureAdjustable: 'unset',
  colorTemperatureMinK: '',
  colorTemperatureMaxK: '',
  isBrightnessAdjustable: 'unset',
  luminousFluxMinLm: '',
  luminousFluxMaxLm: '',
  distribution: '',
  reachMm: '',
};

const EMPTY_PROP_DRAFT: PropSpecDraft = {
  widthMm: '',
  depthMm: '',
  heightMm: '',
  weightG: '',
  isStackable: 'unset',
  mountSurface: '',
};

export const EMPTY_SPEC_DRAFTS: SpecDrafts = {
  desk: EMPTY_DESK_DRAFT,
  monitor: EMPTY_MONITOR_DRAFT,
  arm: EMPTY_ARM_DRAFT,
  light: EMPTY_LIGHT_DRAFT,
  prop: EMPTY_PROP_DRAFT,
};

export const EMPTY_PRODUCT_FORM_DRAFT: ProductFormDraft = {
  common: {
    specType: '',
    brandId: '',
    categoryId: '',
    name: '',
    description: '',
    priceKrw: '',
    productUrl: '',
    status: 'ACTIVE',
    vesaSpecIds: [],
  },
  specs: EMPTY_SPEC_DRAFTS,
};
