// 관리자 검수 화면이 제품 규격·에셋 메타데이터를 3D 뷰 없이 텍스트 표로 요약한다(값은 전부 실측 mm 정수).

import type { components } from '@/types/openapi';
import { vesaSpecLabel } from '@/utils/admin/masterOptions';

type Schemas = components['schemas'];
type ProductDetail = Schemas['ProductDetailResponse'];
type DeskSpec = Schemas['DeskSpecRequest'];
type MonitorSpec = Schemas['MonitorSpecRequest'];
type ArmSpec = Schemas['ArmSpecRequest'];
type LightSpec = Schemas['LightSpecRequest'];
type PropSpec = Schemas['PropSpecRequest'];
type AssetDetail = Schemas['AssetDetailResponse'];

export interface SpecSummaryRow {
  label: string;
  value: string;
}

const DESK_FRAME_TYPE_LABEL: Record<DeskSpec['frameType'], string> = {
  T_FRAME: 'T자 프레임',
  FOUR_LEG: '4다리',
  TOP_ONLY: '상판만',
};

const PANEL_SHAPE_LABEL: Record<MonitorSpec['panelShape'], string> = {
  FLAT: '평면',
  CURVED: '곡면',
};

const ARM_KIND_LABEL: Record<ArmSpec['armKind'], string> = {
  MONITOR: '모니터 암',
  MIC: '마이크 암',
};

const ARM_TYPE_LABEL: Record<ArmSpec['armType'], string> = {
  POLE: '폴 방식',
  ARTICULATED: '관절 방식',
  STAND: '스탠드',
};

const DISTRIBUTION_LABEL: Record<NonNullable<LightSpec['distribution']>, string> = {
  SPOT: '집중형(스팟)',
  FLOOD: '확산형(플러드)',
  AMBIENT: '간접형(앰비언트)',
};

const MOUNT_SURFACE_LABEL: Record<PropSpec['mountSurface'], string> = {
  TOP: '책상 상판',
  PEGBOARD: '타공판',
  WALL: '벽면',
  FLOOR: '바닥',
};

const GLB_EXPORT_MODE_LABEL: Record<NonNullable<AssetDetail['glbExportMode']>, string> = {
  PART_SEGMENTATION: '파트 분할(관절 있음)',
  TEXTURE: '텍스처(단일 메쉬)',
};

const FINISH_LABEL: Record<NonNullable<AssetDetail['finish']>, string> = {
  CLEAR_ACRYLIC: '투명 아크릴',
  METALLIC: '메탈릭',
  WHITE: '화이트',
  BLACK: '블랙',
};

const number = (value: number | undefined, unit: string): string | null =>
  value === undefined ? null : `${value.toLocaleString('ko-KR')}${unit}`;

const mm = (value: number | undefined): string | null => number(value, 'mm');

const yesNo = (value: boolean | undefined): string | null => {
  if (value === undefined) return null;
  return value ? '예' : '아니오';
};

const range = (min: number | undefined, max: number | undefined, unit: string): string | null => {
  if (min === undefined && max === undefined) return null;
  const low = min === undefined ? '?' : min.toLocaleString('ko-KR');
  const high = max === undefined ? '?' : max.toLocaleString('ko-KR');
  return `${low} ~ ${high}${unit}`;
};

const createCollector = (): {
  rows: SpecSummaryRow[];
  add: (l: string, v: string | null) => void;
} => {
  const rows: SpecSummaryRow[] = [];
  const add = (label: string, value: string | null): void => {
    if (value !== null && value !== '') rows.push({ label, value });
  };
  return { rows, add };
};

const deskRows = (desk: DeskSpec): SpecSummaryRow[] => {
  const { rows, add } = createCollector();
  add('가로(폭)', mm(desk.widthMm));
  add('세로(깊이)', mm(desk.depthMm));
  add('높이', mm(desk.heightMm));
  add('상판 두께', mm(desk.topThicknessMm));
  add('엣지 두께', mm(desk.edgeThicknessMm));
  add('모서리 라운드', yesNo(desk.isRounded));
  add('프레임', desk.frameType ? DESK_FRAME_TYPE_LABEL[desk.frameType] : null);
  add('상판 재질 id', desk.deskTextureId === undefined ? null : String(desk.deskTextureId));
  add('허용 하중', number(desk.allowedLoadG, 'g'));
  return rows;
};

const monitorRows = (monitor: MonitorSpec): SpecSummaryRow[] => {
  const { rows, add } = createCollector();
  add('화면 크기', monitor.diagonalInch === undefined ? null : `${monitor.diagonalInch}인치`);
  add(
    '화면 비율',
    monitor.aspectWidth === undefined || monitor.aspectHeight === undefined
      ? null
      : `${monitor.aspectWidth}:${monitor.aspectHeight}`,
  );
  add('베젤 두께', mm(monitor.bezelMm));
  add('패널 두께', mm(monitor.panelThicknessMm));
  add('패널 형태', monitor.panelShape ? PANEL_SHAPE_LABEL[monitor.panelShape] : null);
  add('곡률 반경', mm(monitor.curvatureRadiusMm));
  add('스탠드 깊이', mm(monitor.standDepthMm));
  add('스탠드 분리', yesNo(monitor.isStandDetachable));
  add('피벗(세로 회전)', yesNo(monitor.isPivotSupported));
  add('스위블 최대', number(monitor.swivelMaxDeg, '°'));
  add('높이 조절 범위', mm(monitor.heightAdjustRangeMm));
  add('틸트 범위', range(monitor.tiltMinDeg, monitor.tiltMaxDeg, '°'));
  add('무게', number(monitor.weightG, 'g'));
  add('포트', monitor.ports === undefined ? null : monitor.ports.join(', '));
  return rows;
};

const armRows = (arm: ArmSpec): SpecSummaryRow[] => {
  const { rows, add } = createCollector();
  add('암 종류', arm.armKind ? ARM_KIND_LABEL[arm.armKind] : null);
  add('암 형식', arm.armType ? ARM_TYPE_LABEL[arm.armType] : null);
  add('거치 가능 대수', number(arm.deviceCapacity, '대'));
  add('관절 개수', number(arm.segmentCount, '개'));
  add('폴 높이', mm(arm.poleHeightMm));
  add('도달 거리', range(arm.reachMinMm, arm.reachMaxMm, 'mm'));
  add('거치 높이', range(arm.heightMinMm, arm.heightMaxMm, 'mm'));
  add('클램프 설치', yesNo(arm.isClampMountable));
  add('그로밋 설치', yesNo(arm.isGrommetMountable));
  add('벽면 설치', yesNo(arm.isWallMountable));
  add('클램프 물림 범위', range(arm.clampMinMm, arm.clampMaxMm, 'mm'));
  add('틸트 범위', range(arm.tiltMinDeg, arm.tiltMaxDeg, '°'));
  add('스위블 범위', number(arm.swivelRangeDeg, '°'));
  add('피벗 범위', number(arm.pivotRangeDeg, '°'));
  add('VESA 플레이트 분리', yesNo(arm.isVesaPlateDetachable));
  add('케이블 정리', yesNo(arm.hasCableManagement));
  add('허용 하중', number(arm.allowedLoadG, 'g'));
  return rows;
};

const lightRows = (light: LightSpec): SpecSummaryRow[] => {
  const { rows, add } = createCollector();
  add('가로(폭)', mm(light.widthMm));
  add('세로(깊이)', mm(light.depthMm));
  add('높이', mm(light.heightMm));
  add('색온도 조절', yesNo(light.isColorTemperatureAdjustable));
  add('색온도 범위', range(light.colorTemperatureMinK, light.colorTemperatureMaxK, 'K'));
  add('밝기 조절', yesNo(light.isBrightnessAdjustable));
  add('광속 범위', range(light.luminousFluxMinLm, light.luminousFluxMaxLm, 'lm'));
  add('배광', light.distribution ? DISTRIBUTION_LABEL[light.distribution] : null);
  add('도달 거리', mm(light.reachMm));
  return rows;
};

const propRows = (prop: PropSpec): SpecSummaryRow[] => {
  const { rows, add } = createCollector();
  add('가로(폭)', mm(prop.widthMm));
  add('세로(깊이)', mm(prop.depthMm));
  add('높이', mm(prop.heightMm));
  add('무게', number(prop.weightG, 'g'));
  add('적층 가능', yesNo(prop.isStackable));
  add('설치면', prop.mountSurface ? MOUNT_SURFACE_LABEL[prop.mountSurface] : null);
  return rows;
};

// VESA 태깅은 제품 레벨(product_vesa)이라 규격 서브타입이 아니라 상세에서 읽는다.
// 모니터·모니터암만 값을 가질 수 있어 그 둘의 표에만 붙인다.
const vesaRow = (detail: ProductDetail): SpecSummaryRow => {
  const labels = (detail.vesaSpecs ?? [])
    .filter((spec): spec is { widthMm: number; heightMm: number } => {
      return spec.widthMm != null && spec.heightMm != null;
    })
    .map((spec) => vesaSpecLabel(spec.widthMm, spec.heightMm));

  return { label: 'VESA 규격', value: labels.length === 0 ? '없음' : labels.join(', ') };
};

/** 규격 서브타입 5종 중 채워진 것 하나를 라벨·값 표로 편다. */
export const summarizeProductSpec = (detail: ProductDetail): SpecSummaryRow[] => {
  if (detail.desk) return deskRows(detail.desk);
  if (detail.monitor) return [...monitorRows(detail.monitor), vesaRow(detail)];
  if (detail.arm) return [...armRows(detail.arm), vesaRow(detail)];
  if (detail.light) return lightRows(detail.light);
  if (detail.prop) return propRows(detail.prop);
  return [];
};

/** GLB 에셋 메타데이터 요약 — 책상처럼 에셋 행이 없으면 빈 배열이다(D18 절차 생성). */
export const summarizeProductAsset = (detail: ProductDetail): SpecSummaryRow[] => {
  const asset = detail.asset;
  if (!asset) return [];

  const { rows, add } = createCollector();
  add('GLB 파일', asset.assetUrl === undefined ? null : '업로드됨');
  add('내보내기 방식', asset.glbExportMode ? GLB_EXPORT_MODE_LABEL[asset.glbExportMode] : null);
  add('마감', asset.finish ? FINISH_LABEL[asset.finish] : null);
  add('폴리곤 수', number(asset.polygonCount, '개'));
  add(
    '관절(리그)',
    asset.rigManifest === undefined
      ? null
      : `조인트 ${asset.rigManifest.joints?.length ?? 0}개 / 세그먼트 ${Object.keys(asset.rigManifest.segments ?? {}).length}개`,
  );
  return rows;
};
