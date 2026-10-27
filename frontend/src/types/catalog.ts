// 카탈로그 마스터·제품 상세 와이어 타입.
//
// 사용자용 마스터 2종(`GET /categories`·`GET /desk-textures`, DERO-335)은 생성 파일
// `openapi.d.ts`에서 파생한다 — 손으로 옮겨적지 않는다(ADR-0008). 나머지(ProductDetailResponse
// 트리)는 아직 손으로 옮겨적은 상태로 남아 있다: 생성 스키마는 이미 있으므로 별건으로 같은 방식으로
// 옮기면 된다.

import type { components } from './openapi';
import type { AlwaysPresent } from './api';

type Schemas = components['schemas'];

export type SpecTypeCode = 'DESK' | 'MONITOR' | 'ARM' | 'LIGHT' | 'PROP';

/** 카테고리 마스터 — 자유 증가 트리. 대분류는 `parentId === null`인 행이다(ADR-0017 결정 4). */
export type CategoryResponse = Omit<
  AlwaysPresent<Schemas['CategoryResponse']>,
  'parentId' | 'description'
> & {
  // 대분류(루트)는 부모가 없다.
  parentId: number | null;
  description: string | null;
};

/** 책상 재질 마스터 — 맵 3종은 presigned GET URL이고 아직 안 올린 재질은 null이다. */
export type DeskTexturePublicResponse = Omit<
  AlwaysPresent<Schemas['DeskTexturePublicResponse']>,
  'albedoUrl' | 'roughnessUrl' | 'normalUrl' | 'tileSizeMm'
> & {
  albedoUrl: string | null;
  roughnessUrl: string | null;
  normalUrl: string | null;
  tileSizeMm: number | null;
};

export interface VesaSpecResponse {
  id: number;
  widthMm: number;
  heightMm: number;
}

export interface DeskSpecRequest {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  topThicknessMm: number;
  edgeThicknessMm: number;
  isRounded: boolean;
  deskTextureId: number;
  frameType: 'T_FRAME' | 'FOUR_LEG' | 'TOP_ONLY';
  allowedLoadG: number | null;
}

export interface MonitorSpecRequest {
  diagonalInch: number;
  aspectWidth: number;
  aspectHeight: number;
  bezelMm: number;
  panelThicknessMm: number | null;
  panelShape: 'FLAT' | 'CURVED';
  curvatureRadiusMm: number | null;
  standDepthMm: number;
  isStandDetachable: boolean;
  isPivotSupported: boolean;
  swivelMaxDeg: number | null;
  heightAdjustRangeMm: number | null;
  tiltMinDeg: number | null;
  tiltMaxDeg: number | null;
  weightG: number;
  ports: string[] | null;
}

export interface ArmSpecRequest {
  armKind: 'MONITOR' | 'MIC';
  armType: 'POLE' | 'ARTICULATED' | 'STAND';
  deviceCapacity: number;
  segmentCount: number | null;
  poleHeightMm: number | null;
  reachMinMm: number | null;
  reachMaxMm: number | null;
  heightMinMm: number | null;
  heightMaxMm: number | null;
  isClampMountable: boolean;
  isGrommetMountable: boolean;
  isWallMountable: boolean;
  clampMinMm: number | null;
  clampMaxMm: number | null;
  tiltMinDeg: number | null;
  tiltMaxDeg: number | null;
  swivelRangeDeg: number | null;
  pivotRangeDeg: number | null;
  isVesaPlateDetachable: boolean;
  hasCableManagement: boolean;
  allowedLoadG: number;
}

export interface LightSpecRequest {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  isColorTemperatureAdjustable: boolean;
  colorTemperatureMinK: number | null;
  colorTemperatureMaxK: number | null;
  isBrightnessAdjustable: boolean;
  luminousFluxMinLm: number | null;
  luminousFluxMaxLm: number | null;
  distribution: 'SPOT' | 'FLOOD' | 'AMBIENT' | null;
  reachMm: number | null;
}

export interface PropSpecRequest {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  weightG: number | null;
  isStackable: boolean;
  mountSurface: 'TOP' | 'PEGBOARD' | 'WALL' | 'FLOOR';
}

export interface RigManifestJoint {
  joint: string;
  label: string;
  parent: string;
  child: string;
  axis: [number, number, number];
  point: [number, number, number];
  kind: 'revolute' | 'prismatic' | null;
  minDeg: number | null;
  maxDeg: number | null;
  minMm: number | null;
  maxMm: number | null;
  coupledTo: { joint: string; ratio: number; offset: number | null } | null;
}

export interface RigManifestDto {
  segments: Record<string, string[]>;
  joints: RigManifestJoint[];
  supportPart: string | null;
  mountPart: string | null;
}

export interface AssetDetailResponse {
  assetKey: string;
  assetUrl: string;
  glbExportMode: 'PART_SEGMENTATION' | 'TEXTURE';
  finish: 'CLEAR_ACRYLIC' | 'METALLIC' | 'WHITE' | 'BLACK' | null;
  rigManifest: RigManifestDto | null;
  polygonCount: number | null;
  reviewStatus: string;
  reviewNote: string | null;
}

export interface ProductEmitterResponse {
  productId: number;
  shape: 'POINT' | 'SPOT';
  distribution: 'SPOT' | 'FLOOD' | 'AMBIENT' | null;
  lumens: number;
  radiusMm: number;
  recolorable: boolean;
  defaultColor: string;
  pointXMm: number | null;
  pointYMm: number | null;
  pointZMm: number | null;
}

export interface ProductImageDetailResponse {
  imageId: number;
  imageUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

export interface ProductDetailResponse {
  id: number;
  specType: SpecTypeCode;
  source: string;
  brandId: number | null;
  brandName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  priceKrw: number | null;
  productUrl: string | null;
  status: string;
  desk: DeskSpecRequest | null;
  monitor: MonitorSpecRequest | null;
  arm: ArmSpecRequest | null;
  light: LightSpecRequest | null;
  prop: PropSpecRequest | null;
  asset: AssetDetailResponse | null;
  emitter: ProductEmitterResponse | null;
  images: ProductImageDetailResponse[];
  vesaSpecs: VesaSpecResponse[];
}
