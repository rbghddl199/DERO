// 관리자 에셋·발광 초안 ↔ 와이어 변환 — 상세 응답을 문자열 초안으로 펴고, 제출 직전에
// AssetRegisterRequest·ProductEmitterRequest로 되접는다. 리그 매니페스트는 와이어 타입이
// 전부 옵셔널이라 3D 런타임 타입(RigManifest)으로 좁히는 파싱이 여기 한 곳에만 있다.

import { EMPTY_ASSET_DRAFT, EMPTY_EMITTER_DRAFT } from '@/constants/admin/asset';
import type {
  AssetDetailResponse,
  AssetDraft,
  AssetRegisterRequest,
  EmitterDraft,
  ProductEmitterRequest,
  ProductEmitterResponse,
  WireRigManifest,
} from '@/types/admin/asset';
import type { BooleanChoice } from '@/types/admin/productForm';
import type { RigJoint, RigManifest } from '@/three/scene/product';
import type { EmitterPreviewDraft } from '@/three/scene/emitterPreview';

type WireJoint = NonNullable<WireRigManifest['joints']>[number];

const toText = (value: number | undefined): string => (value === undefined ? '' : String(value));

const toChoice = (value: boolean | undefined): BooleanChoice => {
  if (value === undefined) return 'unset';
  return value ? 'yes' : 'no';
};

const trimmedOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const numberOrUndefined = (value: string): number | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
};

// --- 에셋 --------------------------------------------------------------------

export function assetDraftFromDetail(asset: AssetDetailResponse | undefined): AssetDraft {
  if (!asset) return EMPTY_ASSET_DRAFT;
  return {
    glbExportMode: asset.glbExportMode ?? '',
    finish: asset.finish ?? '',
    polygonCount: toText(asset.polygonCount),
  };
}

/**
 * PUT /admin/products/{id}/asset 본문. `finish`는 PART_SEGMENTATION일 때만 싣는다 —
 * TEXTURE는 GLB 안의 PBR이 재질 정본이라 값을 넣으면 정본이 둘이 된다(erd.md `asset`).
 * TEXTURE면 리그 매니페스트도 싣지 않는다: 융합 메쉬에는 매니페스트가 가리킬 파트가 없다.
 */
export function buildAssetPayload(
  assetKey: string,
  draft: AssetDraft,
  rigManifest: RigManifest | null,
): AssetRegisterRequest {
  if (draft.glbExportMode === '') {
    throw new Error('GLB export 모드를 고르지 않았습니다.');
  }

  const isPartSegmentation = draft.glbExportMode === 'PART_SEGMENTATION';

  return {
    assetKey,
    glbExportMode: draft.glbExportMode,
    finish: isPartSegmentation && draft.finish !== '' ? draft.finish : undefined,
    rigManifest: isPartSegmentation && rigManifest ? rigManifestToWire(rigManifest) : undefined,
    polygonCount: numberOrUndefined(draft.polygonCount),
  };
}

// --- 리그 매니페스트 ---------------------------------------------------------

/** 3D 런타임 타입은 필수 필드가 채워져 있어 와이어 타입으로 그대로 나간다(좁히기만 한 관계다). */
export function rigManifestToWire(manifest: RigManifest): WireRigManifest {
  return manifest;
}

export interface ParsedRigManifest {
  manifest: RigManifest;
  /** 필수 필드가 빠져 읽지 못한 관절 수. 0이 아니면 화면이 경고한다 — 저장하면 그만큼 사라진다. */
  droppedJoints: number;
}

const toTriple = (value: number[] | undefined): [number, number, number] | null => {
  if (!value || value.length !== 3) return null;
  if (!value.every((n) => Number.isFinite(n))) return null;
  return [value[0], value[1], value[2]];
};

function jointFromWire(raw: WireJoint): RigJoint | null {
  const { joint, label, parent, child } = raw;
  if (!joint || !label || !parent || !child) return null;

  const axis = toTriple(raw.axis);
  const point = toTriple(raw.point);
  if (!axis || !point) return null;

  const coupledTo =
    raw.coupledTo?.joint !== undefined && Number.isFinite(raw.coupledTo.ratio)
      ? {
          joint: raw.coupledTo.joint,
          ratio: raw.coupledTo.ratio ?? 1,
          ...(raw.coupledTo.offset === undefined ? {} : { offset: raw.coupledTo.offset }),
        }
      : undefined;

  const base = { joint, label, parent, child, axis, point, coupledTo };

  // 종류별로 소유한 한계 필드만 남긴다 — 반대편 필드가 객체에 남아 있으면 validateManifest가
  // 반려한다(`!== undefined`로 금지 필드를 실제로 들여다본다, rig.ts).
  if (raw.kind === 'prismatic') {
    return { ...base, kind: 'prismatic', minMm: raw.minMm ?? 0, maxMm: raw.maxMm ?? 0 };
  }
  return { ...base, minDeg: raw.minDeg ?? 0, maxDeg: raw.maxDeg ?? 0 };
}

/** 저장된 매니페스트를 저작 도구가 편집할 수 있는 형태로 좁힌다. 행이 없으면 null이다. */
export function rigManifestFromWire(wire: WireRigManifest | undefined): ParsedRigManifest | null {
  if (!wire) return null;

  const segments: Record<string, string[]> = {};
  for (const [name, nodes] of Object.entries(wire.segments ?? {})) {
    segments[name] = [...nodes];
  }

  const joints: RigJoint[] = [];
  let droppedJoints = 0;
  for (const raw of wire.joints ?? []) {
    const parsed = jointFromWire(raw);
    if (parsed) joints.push(parsed);
    else droppedJoints += 1;
  }

  const manifest: RigManifest = { segments, joints };
  if (wire.supportPart !== undefined) manifest.supportPart = wire.supportPart;
  if (wire.mountPart !== undefined) manifest.mountPart = wire.mountPart;

  return { manifest, droppedJoints };
}

// --- 발광 --------------------------------------------------------------------

export function emitterDraftFromDetail(emitter: ProductEmitterResponse | undefined): EmitterDraft {
  if (!emitter) return EMPTY_EMITTER_DRAFT;
  return {
    shape: emitter.shape ?? '',
    distribution: emitter.distribution ?? '',
    lumens: toText(emitter.lumens),
    radiusMm: toText(emitter.radiusMm),
    recolorable: toChoice(emitter.recolorable),
    defaultColor: emitter.defaultColor ?? EMPTY_EMITTER_DRAFT.defaultColor,
    pointXMm: toText(emitter.pointXMm),
    pointYMm: toText(emitter.pointYMm),
    pointZMm: toText(emitter.pointZMm),
  };
}

/**
 * PUT /admin/products/{id}/emitter 본문. `distribution`은 SPOT일 때만 싣고(POINT에는 조일
 * 원뿔이 없다), `point_*_mm`는 셋 다 싣거나 셋 다 뺀다(erd.md `product_emitter`).
 */
export function buildEmitterPayload(draft: EmitterDraft): ProductEmitterRequest {
  if (draft.shape === '') {
    throw new Error('발광 형태를 고르지 않았습니다.');
  }
  if (draft.recolorable === 'unset') {
    throw new Error('색 변경 가능 여부를 고르지 않았습니다.');
  }

  const point = [draft.pointXMm, draft.pointYMm, draft.pointZMm].map(numberOrUndefined);
  const hasPoint = point.every((value) => value !== undefined);

  return {
    shape: draft.shape,
    distribution:
      draft.shape === 'SPOT' && draft.distribution !== '' ? draft.distribution : undefined,
    lumens: Number(draft.lumens.trim()),
    radiusMm: Number(draft.radiusMm.trim()),
    recolorable: draft.recolorable === 'yes',
    defaultColor: trimmedOrUndefined(draft.defaultColor) ?? '',
    pointXMm: hasPoint ? point[0] : undefined,
    pointYMm: hasPoint ? point[1] : undefined,
    pointZMm: hasPoint ? point[2] : undefined,
  };
}

/**
 * 3D 프리뷰가 읽을 수 있는 형태로 초안을 편다. **저장 payload와 규칙이 다르다** —
 * payload는 반려로 사용자를 막지만 프리뷰는 "지금 입력한 만큼"을 보여줘야 하므로
 * 렌더에 반드시 필요한 값(형태·광속·반경)이 없을 때만 null(= 발광 없음)이다.
 *
 * <p>색이 형식에 안 맞으면 흰색으로 폴백한다(입력 도중 `#ff`가 검정으로 튀지 않게).
 * 발광 지점은 셋 다 채워졌을 때만 쓰고, 아니면 null로 넘겨 런타임 bbox 중심 폴백에
 * 맡긴다 — 저장 규칙("셋 다 채우거나 셋 다 비우거나")과 같은 축이다.
 */
export function emitterPreviewFromDraft(draft: EmitterDraft): EmitterPreviewDraft | null {
  if (draft.shape === '') return null;

  const lumens = numberOrUndefined(draft.lumens);
  const radiusMm = numberOrUndefined(draft.radiusMm);
  if (lumens === undefined || !Number.isFinite(lumens)) return null;
  if (radiusMm === undefined || !Number.isFinite(radiusMm) || radiusMm <= 0) return null;

  const color = draft.defaultColor.trim();
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(color) ? parseInt(color.slice(1), 16) : 0xffffff;

  const [x, y, z] = [draft.pointXMm, draft.pointYMm, draft.pointZMm].map(numberOrUndefined);
  const hasPoint = [x, y, z].every((v) => v !== undefined && Number.isFinite(v));

  return {
    shape: draft.shape,
    distribution: draft.shape === 'SPOT' && draft.distribution !== '' ? draft.distribution : null,
    lumens,
    radiusMm,
    colorHex,
    pointMm: hasPoint ? { x: x as number, y: y as number, z: z as number } : null,
  };
}
