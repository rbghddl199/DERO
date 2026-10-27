// 백엔드 ProductDetailResponse -> 엔진 규격 DB(ProductSpec) 어댑터 (DERO-325, ADR-0017).
// product.ts 자신은 "three 임포트 없음 + api 비의존" 규약이라(props.ts·snap.ts와 동일), 이 변환은
// 별도 파일에 둔다 — product.ts에 넣으면 api/product.ts와 순환 임포트가 생긴다.

import type {
  ArmSpecRequest,
  AssetDetailResponse,
  DeskSpecRequest,
  DeskTexturePublicResponse,
  LightSpecRequest,
  MonitorSpecRequest,
  ProductDetailResponse,
  PropSpecRequest,
  RigManifestJoint,
} from '@/types/catalog';
import { colorTempKFromHex } from './lighting';
import { monitorDims, type AspectRatio } from './monitor';
import type { EmitterManifest } from './emitters';
import { deskSkinForTextureId, type DeskFrameType } from '../core/deskConfig';
import type { MaterialSkin, ProductKind, ProductSpec, RigJoint, RigManifest } from './product';

const BACKEND_FRAME_TYPE_TO_LOCAL: Record<DeskSpecRequest['frameType'], DeskFrameType> = {
  T_FRAME: 't-frame',
  FOUR_LEG: 'four-leg',
  TOP_ONLY: 'top-only',
};

/** 코드 재질 프리셋(asset.finish) -> 렌더 스킨. glbExportMode === 'PART_SEGMENTATION'일 때만
 *  쓰인다 — 색·거칠기·금속성의 정본은 코드다(Finish.java 문서 주석). WHITE는 기존 목업
 *  'monitor-arm-white' 항목과 같은 값을 재사용해 룩을 맞춘다. */
const FINISH_TO_MATERIAL_SKIN: Record<NonNullable<AssetDetailResponse['finish']>, MaterialSkin> = {
  CLEAR_ACRYLIC: { class: 'glass', baseColor: 0xe8f0f2, roughness: 0.06, metalness: 0 },
  METALLIC: { class: 'metal', baseColor: 0xc9ccd1, roughness: 0.3, metalness: 0.85 },
  WHITE: { class: 'plastic', baseColor: 0xf0f1f3, roughness: 0.42, metalness: 0.08 },
  BLACK: { class: 'plastic', baseColor: 0x2b2d31, roughness: 0.4, metalness: 0.1 },
};

/** glbExportMode === 'TEXTURE'인 자산은 GLB 자체 텍스처가 렌더를 지배해 이 값이 화면에
 *  안 쓰인다 — ProductSpec.material이 필수 필드라 채우는 자리표시자. */
const INERT_MATERIAL_SKIN: MaterialSkin = {
  class: 'plastic',
  baseColor: 0xffffff,
  roughness: 0.6,
  metalness: 0,
};

function materialSkinFor(asset: ProductDetailResponse['asset']): MaterialSkin {
  if (asset?.glbExportMode === 'PART_SEGMENTATION' && asset.finish) {
    return FINISH_TO_MATERIAL_SKIN[asset.finish];
  }
  return INERT_MATERIAL_SKIN;
}

function kindFor(specType: ProductDetailResponse['specType']): ProductKind {
  switch (specType) {
    case 'DESK':
      return 'surface';
    case 'LIGHT':
      return 'lamp';
    default:
      return 'prop';
  }
}

function emitterFor(emitter: ProductDetailResponse['emitter']): EmitterManifest | undefined {
  if (!emitter) return undefined;
  const point =
    emitter.pointXMm != null && emitter.pointYMm != null && emitter.pointZMm != null
      ? ([emitter.pointXMm / 1000, emitter.pointYMm / 1000, emitter.pointZMm / 1000] as [
          number,
          number,
          number,
        ])
      : undefined;
  return {
    recolorable: emitter.recolorable,
    defaultColor: emitter.defaultColor,
    lumens: emitter.lumens,
    radiusMm: emitter.radiusMm,
    point,
  };
}

function toRigJoint(j: RigManifestJoint): RigJoint {
  const base = {
    joint: j.joint,
    label: j.label,
    parent: j.parent,
    child: j.child,
    axis: j.axis,
    point: j.point,
    coupledTo: j.coupledTo
      ? {
          joint: j.coupledTo.joint,
          ratio: j.coupledTo.ratio,
          offset: j.coupledTo.offset ?? undefined,
        }
      : undefined,
  };
  if (j.kind === 'prismatic') {
    return { ...base, kind: 'prismatic', minMm: j.minMm ?? 0, maxMm: j.maxMm ?? 0 };
  }
  return { ...base, kind: 'revolute', minDeg: j.minDeg ?? 0, maxDeg: j.maxDeg ?? 0 };
}

function toRigManifest(rigManifest: AssetDetailResponse['rigManifest']): RigManifest | undefined {
  if (!rigManifest) return undefined;
  return {
    segments: rigManifest.segments,
    joints: rigManifest.joints.map(toRigJoint),
    supportPart: rigManifest.supportPart ?? undefined,
    mountPart: rigManifest.mountPart ?? undefined,
  };
}

function deskFields(
  desk: DeskSpecRequest,
  deskTextures: DeskTexturePublicResponse[],
): Pick<
  ProductSpec,
  | 'widthMm'
  | 'depthMm'
  | 'heightMm'
  | 'topThicknessMm'
  | 'edgeThicknessMm'
  | 'frameType'
  | 'material'
> {
  const material: MaterialSkin = deskSkinForTextureId(deskTextures, desk.deskTextureId);
  return {
    widthMm: desk.widthMm,
    depthMm: desk.depthMm,
    heightMm: desk.heightMm,
    topThicknessMm: desk.topThicknessMm,
    edgeThicknessMm: desk.edgeThicknessMm,
    frameType: BACKEND_FRAME_TYPE_TO_LOCAL[desk.frameType],
    material,
  };
}

function monitorFields(
  monitor: MonitorSpecRequest,
  vesaSpecs: ProductDetailResponse['vesaSpecs'],
): Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm' | 'monitor' | 'material'> {
  const aspectRatio = `${monitor.aspectWidth}:${monitor.aspectHeight}` as AspectRatio;
  const spec = {
    diagonalInch: monitor.diagonalInch,
    aspectRatio,
    panelShape: monitor.panelShape === 'CURVED' ? ('curved' as const) : ('flat' as const),
    curvatureRadiusMm: monitor.curvatureRadiusMm ?? undefined,
    bezelMm: monitor.bezelMm,
    standDepthMm: monitor.standDepthMm,
    vesa: vesaSpecs.map((v) => `${v.widthMm}x${v.heightMm}`),
    weightG: monitor.weightG,
    ports: monitor.ports ?? [],
  };
  // widthMm/depthMm/heightMm은 저장값이 아니라 monitor.ts monitorDims()의 파생값이다
  // (three/scene/product.ts의 기존 MONITOR_27/34 항목과 같은 조립 방식).
  return {
    ...monitorDims(spec),
    monitor: spec,
    material: { class: 'display', baseColor: 0x14161a, roughness: 0.35, metalness: 0.1 },
  };
}

function armFields(
  arm: ArmSpecRequest,
  vesaSpecs: ProductDetailResponse['vesaSpecs'],
): Pick<ProductSpec, 'arm'> {
  return {
    arm: {
      vesa: vesaSpecs.map((v) => `${v.widthMm}x${v.heightMm}`),
      loadCapacityG: arm.allowedLoadG,
      isClampMountable: arm.isClampMountable,
      clampMinMm: arm.clampMinMm ?? undefined,
      clampMaxMm: arm.clampMaxMm ?? undefined,
      reachMinMm: arm.reachMinMm ?? undefined,
      reachMaxMm: arm.reachMaxMm ?? undefined,
      heightMinMm: arm.heightMinMm ?? undefined,
      heightMaxMm: arm.heightMaxMm ?? undefined,
    },
  };
}

function toDistribution(d: LightSpecRequest['distribution']): 'spot' | 'flood' | 'ambient' {
  switch (d) {
    case 'FLOOD':
      return 'flood';
    case 'AMBIENT':
      return 'ambient';
    default:
      return 'spot';
  }
}

function lightFields(
  light: LightSpecRequest,
  emitter: ProductDetailResponse['emitter'],
): Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm' | 'optical' | 'material'> {
  return {
    widthMm: light.widthMm,
    depthMm: light.depthMm,
    heightMm: light.heightMm,
    optical: {
      // 렌더가 읽는 정격 lm·반경은 product_emitter가 정본 — light 서브타입은 카탈로그 마커.
      colorTempK: emitter?.defaultColor ? colorTempKFromHex(emitter.defaultColor) : 3000,
      lumens: emitter?.lumens ?? 0,
      reachMm: emitter?.radiusMm ?? 0,
      distribution: toDistribution(light.distribution ?? emitter?.distribution ?? null),
      colorTempMinK: light.colorTemperatureMinK ?? undefined,
      colorTempMaxK: light.colorTemperatureMaxK ?? undefined,
      lumensMinLm: light.luminousFluxMinLm ?? undefined,
      lumensMaxLm: light.luminousFluxMaxLm ?? undefined,
    },
    material: { class: 'shade', baseColor: 0xe8e2d6, roughness: 0.6, metalness: 0.05 },
  };
}

function propFields(
  prop: PropSpecRequest,
): Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm' | 'stackable' | 'mountSurface'> {
  return {
    widthMm: prop.widthMm,
    depthMm: prop.depthMm,
    heightMm: prop.heightMm,
    stackable: prop.isStackable,
    // 배치면은 PROP 서브타입에만 있는 컬럼이다 — 나머지 규격은 비운 채로 두고
    // 엔진이 'TOP'으로 취급한다 (product.ts mountSurface 주석).
    mountSurface: prop.mountSurface,
  };
}

/** ARM 서브타입엔 박스 치수(widthMm/depthMm/heightMm) 컬럼이 없다(DERO-325) — 실측은 GLB
 *  Box3로만 가능하다. **그 실측은 여기서 하지 않는다**: 목록에 뜬 암마다 GLB를 받으면 지연 로딩이
 *  무의미해지므로, 카드에는 아래 자리표시자를 싣고 `meshDerivedDims`로 표시해 배치 직전
 *  `ProductAssets.ensureTemplate`이 실측으로 확정하게 한다 (DERO-374). */
const ARM_FALLBACK_DIMS_MM = { widthMm: 100, depthMm: 385, heightMm: 400 };

/** 제품 상세 하나를 엔진 ProductSpec으로 변환한다. specType별 규격 칸 중 정확히 하나만 읽는다.
 *  결측(규격 칸이 null인데 specType이 그걸 가리킴 — 데이터 오류)이면 null을 돌려주고 호출부가
 *  건너뛴다(카탈로그 목록에서 조용히 빠지는 것이 씬을 죽이는 것보다 낫다). */
export async function toProductSpec(
  dto: ProductDetailResponse,
  deskTextures: DeskTexturePublicResponse[],
): Promise<ProductSpec | null> {
  const common = {
    id: String(dto.id),
    name: dto.name,
    kind: kindFor(dto.specType),
    categoryId: dto.categoryId ?? undefined,
    categoryName: dto.categoryName ?? undefined,
    priceKrw: dto.priceKrw ?? undefined,
    brand: dto.brandName ?? undefined,
    imageUrl: dto.images.find((i) => i.isPrimary)?.imageUrl ?? dto.images[0]?.imageUrl,
    // 대표를 맨 앞에 두고 나머지를 displayOrder 순으로 — 상세 갤러리가 이 순서를 그대로 쓴다.
    imageUrls: [...dto.images]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder)
      .map((i) => i.imageUrl),
    description: dto.description ?? undefined,
    productUrl: dto.productUrl ?? undefined,
    // 모니터는 전량 절차 생성이라 asset 행이 남아 있어도 GLB를 쓰지 않는다(D18 2026-08-02 재개정)
    // — glbUrl이 채워지면 scene.ts가 buildProp 대신 GLB 통짜로 대체해 절차 생성이 죽는다.
    glbUrl: dto.specType === 'MONITOR' ? undefined : dto.asset?.assetUrl,
    glbUntextured: dto.asset?.glbExportMode === 'PART_SEGMENTATION',
    rig: toRigManifest(dto.asset?.rigManifest ?? null),
    emitter: emitterFor(dto.emitter),
  };

  switch (dto.specType) {
    case 'DESK':
      if (!dto.desk) return null;
      return { ...common, ...deskFields(dto.desk, deskTextures) };
    case 'MONITOR':
      if (!dto.monitor) return null;
      return { ...common, ...monitorFields(dto.monitor, dto.vesaSpecs) };
    case 'ARM': {
      if (!dto.arm) return null;
      return {
        ...common,
        ...ARM_FALLBACK_DIMS_MM,
        meshDerivedDims: true,
        ...armFields(dto.arm, dto.vesaSpecs),
        material: materialSkinFor(dto.asset),
      };
    }
    case 'LIGHT':
      if (!dto.light) return null;
      return { ...common, ...lightFields(dto.light, dto.emitter) };
    case 'PROP':
      if (!dto.prop) return null;
      return { ...common, ...propFields(dto.prop), material: materialSkinFor(dto.asset) };
    default:
      return null;
  }
}

// 카테고리 마스터 유틸(topAncestorId, 옛 buildCategoryGroups/CategoryRailGroup)은 전부 삭제됐다 —
// 2026-08-05 카테고리 정적 고정(constants/productCategoryGroup.ts)으로 프론트가 GET /categories
// 트리를 다루지 않는다. 제품↔카테고리 매칭은 matchesCategoryFilter(카테고리 이름 비교) 하나다.
