export type Vec3 = [number, number, number];

export const LIGHTING_ROLES = [
  'DESK_TASK',
  'MONITOR_TASK',
  'AMBIENT_POINT',
  'AMBIENT_INDIRECT',
  'DECORATIVE_EMISSIVE',
  'STRIP_PATH',
] as const;
export type LightingRole = (typeof LIGHTING_ROLES)[number];

export const RENDER_PRESETS = [
  'DESK_TASK_HYBRID',
  'MONITOR_TASK_HYBRID',
  'AMBIENT_POINT_HYBRID',
  'AMBIENT_INDIRECT_HYBRID',
  'DECORATIVE_EMISSIVE',
  'STRIP_PATH_HYBRID',
] as const;
export type RenderPresetId = (typeof RENDER_PRESETS)[number];

export const LIGHT_TYPES = ['POINT', 'SPOT', 'RECT_AREA', 'DIRECTIONAL'] as const;
export type LightType = (typeof LIGHT_TYPES)[number];

export const BOUNCE_ROLES = ['DESK_BOUNCE', 'WALL_BOUNCE', 'REAR_WALL_BOUNCE', 'DOWNWARD_BOUNCE', 'FLOOR_BOUNCE', 'NO_BOUNCE'] as const;
export type BounceRole = (typeof BOUNCE_ROLES)[number];

export const PREVIEW_STAGES = ['MODEL_ONLY', 'EMISSIVE_ONLY', 'MAIN_LIGHT', 'HYBRID_BASIC', 'HYBRID_FINAL'] as const;
export type PreviewStage = (typeof PREVIEW_STAGES)[number];

export type ControlType = 'FIXED' | 'STEP' | 'CONTINUOUS' | 'PRESET';

export interface Recommendation<T> {
  value: T;
  confidence: number;
  requiresReview: boolean;
  method: string;
  evidence: string[];
}

export interface Box3Lite {
  min: Vec3;
  max: Vec3;
}

export interface NodeAnalysis {
  name: string;
  path: string;
  depth: number;
  childCount: number;
  isAnchor: boolean;
}

export interface MeshAnalysis {
  name: string;
  nodeName: string;
  materialName: string | null;
  boundingBox: Box3Lite | null;
  center: Vec3 | null;
  size: Vec3 | null;
}

export interface MaterialAnalysis {
  name: string;
  baseColor: [number, number, number, number] | null;
  emissiveColor: [number, number, number] | null;
  emissiveIntensity: number;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND' | 'UNKNOWN';
  opacity: number;
  transparent: boolean;
  transmission: number;
  doubleSided: boolean;
  metallic: number | null;
  roughness: number | null;
}

export interface EmbeddedLightAnalysis {
  name: string;
  type: 'POINT' | 'SPOT' | 'DIRECTIONAL' | 'UNKNOWN';
  position: Vec3;
  target?: Vec3 | null;
}

export interface ModelAnalysis {
  meshCount: number;
  materialCount: number;
  modelSize: Vec3;
  modelCenter: Vec3;
  boundingBox: Box3Lite | null;
  boundingSphereRadius: number;
  unit: 'METER' | 'UNKNOWN';
  upAxis: 'Y_UP' | 'UNKNOWN';
  nodes: NodeAnalysis[];
  meshes: MeshAnalysis[];
  materials: MaterialAnalysis[];
  embeddedLights: EmbeddedLightAnalysis[];
  anchorNodes: string[];
  emissiveCandidates: Recommendation<string>[];
  materialRoleCandidates: Record<string, Recommendation<string | null>>;
  assetLimitations: string[];
  warnings: string[];
  hasAnimations: boolean;
  hasSkinOrRig: boolean;
}

export interface ProductSpecInput {
  colorTemperatureMinK?: number;
  colorTemperatureMaxK?: number;
  luminousFluxMinLm?: number;
  luminousFluxMaxLm?: number;
  brightnessAdjustable?: boolean;
  colorTemperatureAdjustable?: boolean;
  brightnessControlType?: ControlType;
  colorTemperatureControlType?: ControlType;
  reachM?: number;
  roleHint?: LightingRole | string;
  category?: string;
}

export interface LightManifest {
  schemaVersion: '1.0.0';
  asset: {
    modelFile: string;
    assetVersion: string;
    coordinateSpace: 'NORMALIZED_MODEL_LOCAL' | 'ORIGINAL_MODEL_LOCAL';
    unit: 'METER';
  };
  classification: {
    lightingRole: LightingRole;
    renderPreset: RenderPresetId;
    confidence: number;
  };
  binding: {
    mode: 'MODEL_LOCAL';
    originNode: string | null;
    targetNode: string | null;
    fallbackOrigin: Vec3;
    fallbackTarget: Vec3 | null;
  };
  materialBindings: {
    bulbMesh: string | null;
    shadeMesh: string | null;
    diffuserMesh: string | null;
    emissiveSurfaceMesh: string | null;
  };
  hybridLighting: {
    main: {
      type: LightType;
      intensityRatio: number;
      rangeM: number;
      angleDeg: number;
      penumbra: number;
      castShadow: boolean;
      shadowPriority: number;
    };
    fill: {
      enabled: boolean;
      type: 'POINT';
      localOffset: Vec3;
      intensityRatio: number;
      rangeM: number;
      castShadow: false;
    };
    bouncePolicies: {
      role: BounceRole;
      enabled: boolean;
      intensityRatio: number;
      rangeRatio: number;
      colorMode: 'SOURCE_TINTED' | 'SURFACE_MIXED' | 'NEUTRAL';
    }[];
  };
  materialResponse: {
    emissive: {
      enabled: boolean;
      meshNode: string | null;
      intensityRatio: number;
    };
    translucentShade: {
      supported: boolean;
      meshNode: string | null;
      tintSource: 'BASE_COLOR' | 'CUSTOM';
      tintStrength: number;
    };
  };
  controls: {
    brightness: {
      adjustable: boolean;
      type: ControlType;
      stepCount: number | null;
    };
    colorTemperature: {
      adjustable: boolean;
      type: ControlType;
      minK: number;
      maxK: number;
      stepCount: number | null;
    };
  };
  review: {
    generationMethod: 'RULE_BASED' | 'VISION_ASSISTED';
    confidence: number;
    status: 'AUTO_GENERATED' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_FIX';
    requiresReview: boolean;
  };
  overrides: Record<string, unknown>;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}
