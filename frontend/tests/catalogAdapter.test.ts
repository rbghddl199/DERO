import { describe, it, expect } from 'vitest';
import { toProductSpec } from '../src/three/scene/catalogAdapter';
import type { ProductDetailResponse, DeskTexturePublicResponse } from '../src/types/catalog';

function baseDto(overrides: Partial<ProductDetailResponse>): ProductDetailResponse {
  return {
    id: 1,
    specType: 'PROP',
    source: 'ADMIN',
    brandId: null,
    brandName: '테스트브랜드',
    categoryId: 10,
    categoryName: '소품',
    name: '테스트 제품',
    description: null,
    priceKrw: 12000,
    productUrl: null,
    status: 'APPROVED',
    desk: null,
    monitor: null,
    arm: null,
    light: null,
    prop: null,
    asset: null,
    emitter: null,
    images: [],
    vesaSpecs: [],
    ...overrides,
  };
}

const DESK_TEXTURES: DeskTexturePublicResponse[] = [
  {
    id: 1,
    name: '오크',
    baseColor: '#b8895a',
    albedoUrl: null,
    roughnessUrl: null,
    normalUrl: null,
    roughness: 0.55,
    metalness: 0,
    tileSizeMm: null,
    displayOrder: 0,
  },
];

describe('toProductSpec — DESK', () => {
  it('maps desk spec + desk texture material, frame type', async () => {
    const dto = baseDto({
      specType: 'DESK',
      desk: {
        widthMm: 1200,
        depthMm: 600,
        heightMm: 740,
        topThicknessMm: 25,
        edgeThicknessMm: 25,
        isRounded: false,
        deskTextureId: 1,
        frameType: 'FOUR_LEG',
        allowedLoadG: null,
      },
    });
    const spec = await toProductSpec(dto, DESK_TEXTURES);
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe('surface');
    expect(spec!.widthMm).toBe(1200);
    expect(spec!.frameType).toBe('four-leg');
    expect(spec!.material).toEqual({
      class: 'wood',
      baseColor: 0xb8895a,
      roughness: 0.55,
      metalness: 0,
    });
  });

  it('falls back to a generic oak-ish skin when the desk texture id is unknown', async () => {
    const dto = baseDto({
      specType: 'DESK',
      desk: {
        widthMm: 1400,
        depthMm: 700,
        heightMm: 745,
        topThicknessMm: 30,
        edgeThicknessMm: 30,
        isRounded: false,
        deskTextureId: 999,
        frameType: 'T_FRAME',
        allowedLoadG: null,
      },
    });
    const spec = await toProductSpec(dto, DESK_TEXTURES);
    expect(spec!.frameType).toBe('t-frame');
    expect(spec!.material.class).toBe('wood');
  });

  it('returns null when specType=DESK but the desk spec column is missing', async () => {
    const dto = baseDto({ specType: 'DESK', desk: null });
    expect(await toProductSpec(dto, DESK_TEXTURES)).toBeNull();
  });
});

describe('toProductSpec — MONITOR', () => {
  it('derives width/depth/height from monitorDims and builds an arbitrary aspect ratio', async () => {
    const dto = baseDto({
      specType: 'MONITOR',
      monitor: {
        diagonalInch: 27,
        aspectWidth: 16,
        aspectHeight: 9,
        bezelMm: 8,
        panelThicknessMm: null,
        panelShape: 'FLAT',
        curvatureRadiusMm: null,
        standDepthMm: 130,
        isStandDetachable: true,
        isPivotSupported: false,
        swivelMaxDeg: null,
        heightAdjustRangeMm: null,
        tiltMinDeg: null,
        tiltMaxDeg: null,
        weightG: 4200,
        ports: ['HDMI'],
      },
      vesaSpecs: [{ id: 1, widthMm: 100, heightMm: 100 }],
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.kind).toBe('prop');
    expect(spec!.monitor?.aspectRatio).toBe('16:9');
    expect(spec!.monitor?.vesa).toEqual(['100x100']);
    expect(spec!.widthMm).toBeGreaterThan(0);
    expect(spec!.heightMm).toBeGreaterThan(0);
  });

  it('handles a non-preset aspect ratio (e.g. 4:3) without crashing', async () => {
    const dto = baseDto({
      specType: 'MONITOR',
      monitor: {
        diagonalInch: 19,
        aspectWidth: 4,
        aspectHeight: 3,
        bezelMm: 10,
        panelThicknessMm: null,
        panelShape: 'FLAT',
        curvatureRadiusMm: null,
        standDepthMm: 120,
        isStandDetachable: false,
        isPivotSupported: false,
        swivelMaxDeg: null,
        heightAdjustRangeMm: null,
        tiltMinDeg: null,
        tiltMaxDeg: null,
        weightG: 3000,
        ports: null,
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.monitor?.aspectRatio).toBe('4:3');
    expect(spec!.monitor?.ports).toEqual([]);
  });

  // 모니터는 전량 절차 생성이다(D18 2026-08-02 재개정) — 과거에 등록된 asset 행이 남아 있어도
  // glbUrl로 새면 scene.ts가 GLB 통짜로 대체해 절차 생성이 죽는다.
  it('ignores a leftover asset row so the monitor never renders as a whole GLB', async () => {
    const dto = baseDto({
      specType: 'MONITOR',
      monitor: {
        diagonalInch: 34,
        aspectWidth: 21,
        aspectHeight: 9,
        bezelMm: 6,
        panelThicknessMm: null,
        panelShape: 'CURVED',
        curvatureRadiusMm: 1500,
        standDepthMm: 200,
        isStandDetachable: true,
        isPivotSupported: false,
        swivelMaxDeg: null,
        heightAdjustRangeMm: null,
        tiltMinDeg: null,
        tiltMaxDeg: null,
        weightG: 7200,
        ports: ['HDMI'],
      },
      asset: {
        assetKey: 'k',
        assetUrl: '/assets/legacy-monitor.glb',
        glbExportMode: 'TEXTURE',
        finish: null,
        rigManifest: null,
        polygonCount: null,
        reviewStatus: 'APPROVED',
        reviewNote: null,
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.glbUrl).toBeUndefined();
  });
});

describe('toProductSpec — ARM', () => {
  const armDto = baseDto({
    specType: 'ARM',
    arm: {
      armKind: 'MONITOR',
      armType: 'ARTICULATED',
      deviceCapacity: 1,
      segmentCount: null,
      poleHeightMm: null,
      reachMinMm: null,
      reachMaxMm: null,
      heightMinMm: null,
      heightMaxMm: null,
      isClampMountable: true,
      isGrommetMountable: false,
      isWallMountable: false,
      clampMinMm: 10,
      clampMaxMm: 40,
      tiltMinDeg: null,
      tiltMaxDeg: null,
      swivelRangeDeg: null,
      pivotRangeDeg: null,
      isVesaPlateDetachable: true,
      hasCableManagement: true,
      allowedLoadG: 5000,
    },
    asset: {
      assetKey: 'k',
      assetUrl: '/assets/arm.glb',
      glbExportMode: 'PART_SEGMENTATION',
      finish: 'WHITE',
      rigManifest: null,
      polygonCount: null,
      reviewStatus: 'APPROVED',
      reviewNote: null,
    },
    vesaSpecs: [{ id: 1, widthMm: 75, heightMm: 75 }],
  });

  it('falls back to placeholder box dims when no measureArmDims callback is given (no box columns on ARM)', async () => {
    const spec = await toProductSpec(armDto, []);
    expect(spec).not.toBeNull();
    expect(spec!.widthMm).toBe(100);
    expect(spec!.arm?.loadCapacityG).toBe(5000);
    expect(spec!.arm?.vesa).toEqual(['75x75']);
    expect(spec!.glbUntextured).toBe(true);
    expect(spec!.material).toEqual({
      class: 'plastic',
      baseColor: 0xf0f1f3,
      roughness: 0.42,
      metalness: 0.08,
    });
  });

  it('uses the measured GLB box when a measureArmDims callback is given', async () => {
    const spec = await toProductSpec(armDto, [], async () => ({ x: 0.1, y: 0.4, z: 0.385 }));
    expect(spec!.widthMm).toBeCloseTo(100, 6);
    expect(spec!.heightMm).toBeCloseTo(400, 6);
    expect(spec!.depthMm).toBeCloseTo(385, 6);
  });

  it('falls back to placeholder dims when measureArmDims rejects', async () => {
    const spec = await toProductSpec(armDto, [], async () => {
      throw new Error('404');
    });
    expect(spec!.widthMm).toBe(100);
  });
});

describe('toProductSpec — LIGHT', () => {
  it('reads render-facing lumens/reach from the emitter row, not the light spec row', async () => {
    const dto = baseDto({
      specType: 'LIGHT',
      light: {
        widthMm: 150,
        depthMm: 150,
        heightMm: 460,
        isColorTemperatureAdjustable: true,
        colorTemperatureMinK: 3000,
        colorTemperatureMaxK: 5700,
        isBrightnessAdjustable: true,
        luminousFluxMinLm: 200,
        luminousFluxMaxLm: 560,
        distribution: 'FLOOD',
        reachMm: 1500,
      },
      emitter: {
        productId: 1,
        shape: 'SPOT',
        distribution: 'FLOOD',
        lumens: 560,
        radiusMm: 1500,
        recolorable: false,
        defaultColor: '#ffe9c7',
        pointXMm: null,
        pointYMm: null,
        pointZMm: null,
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.kind).toBe('lamp');
    expect(spec!.optical?.lumens).toBe(560);
    expect(spec!.optical?.reachMm).toBe(1500);
    expect(spec!.optical?.distribution).toBe('flood');
    expect(spec!.optical?.colorTempK).toBeGreaterThan(1000);
    expect(spec!.optical?.colorTempMinK).toBe(3000);
  });
});

describe('toProductSpec — PROP', () => {
  it('maps stackable + mount surface agnostic box dims', async () => {
    const dto = baseDto({
      specType: 'PROP',
      prop: {
        widthMm: 900,
        depthMm: 400,
        heightMm: 4,
        weightG: null,
        isStackable: true,
        mountSurface: 'TOP',
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.kind).toBe('prop');
    expect(spec!.stackable).toBe(true);
    expect(spec!.mountSurface).toBe('TOP');
  });

  it('배치면을 엔진 규격으로 옮긴다 — 바닥 제품이 상판 위에 올라가면 안 된다 (375)', async () => {
    const dto = baseDto({
      specType: 'PROP',
      prop: {
        widthMm: 420,
        depthMm: 320,
        heightMm: 110,
        weightG: 1800,
        isStackable: false,
        mountSurface: 'FLOOR',
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.mountSurface).toBe('FLOOR');
  });

  it('PROP이 아닌 서브타입은 배치면 컬럼이 없어 비어 있다 (엔진이 TOP으로 취급)', async () => {
    const dto = baseDto({
      specType: 'MONITOR',
      monitor: {
        diagonalInch: 27,
        aspectWidth: 16,
        aspectHeight: 9,
        bezelMm: 8,
        panelThicknessMm: null,
        panelShape: 'FLAT',
        curvatureRadiusMm: null,
        standDepthMm: 130,
        isStandDetachable: true,
        isPivotSupported: false,
        swivelMaxDeg: null,
        heightAdjustRangeMm: null,
        tiltMinDeg: null,
        tiltMaxDeg: null,
        weightG: 4200,
        ports: null,
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.mountSurface).toBeUndefined();
  });

  it('derives material from asset.finish like ARM does, not a hardcoded preset', async () => {
    const dto = baseDto({
      specType: 'PROP',
      prop: {
        widthMm: 300,
        depthMm: 200,
        heightMm: 20,
        weightG: null,
        isStackable: false,
        mountSurface: 'TOP',
      },
      asset: {
        assetKey: 'k',
        assetUrl: '/assets/laptop-stand.glb',
        glbExportMode: 'PART_SEGMENTATION',
        finish: 'CLEAR_ACRYLIC',
        rigManifest: null,
        polygonCount: null,
        reviewStatus: 'APPROVED',
        reviewNote: null,
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.material).toEqual({
      class: 'glass',
      baseColor: 0xe8f0f2,
      roughness: 0.06,
      metalness: 0,
    });
  });
});

describe('toProductSpec — common fields', () => {
  it('picks the primary image, falls back to the first image otherwise', async () => {
    const dto = baseDto({
      specType: 'PROP',
      prop: {
        widthMm: 10,
        depthMm: 10,
        heightMm: 10,
        weightG: null,
        isStackable: false,
        mountSurface: 'TOP',
      },
      images: [
        { imageId: 1, imageUrl: '/a.jpg', displayOrder: 0, isPrimary: false },
        { imageId: 2, imageUrl: '/b.jpg', displayOrder: 1, isPrimary: true },
      ],
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.imageUrl).toBe('/b.jpg');
  });

  it('leaves imageUrl undefined when there are no images', async () => {
    const dto = baseDto({
      specType: 'PROP',
      prop: {
        widthMm: 10,
        depthMm: 10,
        heightMm: 10,
        weightG: null,
        isStackable: false,
        mountSurface: 'TOP',
      },
    });
    const spec = await toProductSpec(dto, []);
    expect(spec!.imageUrl).toBeUndefined();
  });

  it('returns null for an unmapped specType/spec-column combination defensively', async () => {
    const dto = baseDto({ specType: 'MONITOR', monitor: null });
    expect(await toProductSpec(dto, [])).toBeNull();
  });
});
