import type { LightManifest, LightingRole, RenderPresetId } from './types';

type HybridLighting = LightManifest['hybridLighting'];

export interface LightingPreset {
  id: RenderPresetId;
  role: LightingRole;
  label: string;
  hybridLighting: HybridLighting;
}

export const LIGHTING_PRESETS: Record<RenderPresetId, LightingPreset> = {
  DESK_TASK_HYBRID: {
    id: 'DESK_TASK_HYBRID',
    role: 'DESK_TASK',
    label: 'Desk task hybrid',
    hybridLighting: {
      main: { type: 'SPOT', intensityRatio: 1, rangeM: 2.5, angleDeg: 55, penumbra: 0.7, castShadow: true, shadowPriority: 3 },
      fill: { enabled: true, type: 'POINT', localOffset: [0, 0, 0], intensityRatio: 0.08, rangeM: 0.8, castShadow: false },
      bouncePolicies: [{ role: 'DESK_BOUNCE', enabled: true, intensityRatio: 0.04, rangeRatio: 0.5, colorMode: 'SOURCE_TINTED' }],
    },
  },
  MONITOR_TASK_HYBRID: {
    id: 'MONITOR_TASK_HYBRID',
    role: 'MONITOR_TASK',
    label: 'Monitor task hybrid',
    hybridLighting: {
      main: { type: 'SPOT', intensityRatio: 0.9, rangeM: 1.8, angleDeg: 78, penumbra: 0.85, castShadow: true, shadowPriority: 2 },
      fill: { enabled: true, type: 'POINT', localOffset: [0, -0.05, 0.12], intensityRatio: 0.04, rangeM: 0.6, castShadow: false },
      bouncePolicies: [{ role: 'DESK_BOUNCE', enabled: true, intensityRatio: 0.025, rangeRatio: 0.55, colorMode: 'SOURCE_TINTED' }],
    },
  },
  AMBIENT_POINT_HYBRID: {
    id: 'AMBIENT_POINT_HYBRID',
    role: 'AMBIENT_POINT',
    label: 'Ambient point hybrid',
    hybridLighting: {
      main: { type: 'POINT', intensityRatio: 0.75, rangeM: 1.4, angleDeg: 90, penumbra: 1, castShadow: false, shadowPriority: 0 },
      fill: { enabled: true, type: 'POINT', localOffset: [0, 0, 0], intensityRatio: 0.05, rangeM: 0.9, castShadow: false },
      bouncePolicies: [{ role: 'DESK_BOUNCE', enabled: true, intensityRatio: 0.02, rangeRatio: 0.5, colorMode: 'SURFACE_MIXED' }],
    },
  },
  AMBIENT_INDIRECT_HYBRID: {
    id: 'AMBIENT_INDIRECT_HYBRID',
    role: 'AMBIENT_INDIRECT',
    label: 'Ambient indirect hybrid',
    hybridLighting: {
      main: { type: 'SPOT', intensityRatio: 0.65, rangeM: 2, angleDeg: 82, penumbra: 0.9, castShadow: false, shadowPriority: 0 },
      fill: { enabled: true, type: 'POINT', localOffset: [0, 0.04, 0], intensityRatio: 0.04, rangeM: 1, castShadow: false },
      bouncePolicies: [{ role: 'WALL_BOUNCE', enabled: true, intensityRatio: 0.035, rangeRatio: 0.75, colorMode: 'SURFACE_MIXED' }],
    },
  },
  DECORATIVE_EMISSIVE: {
    id: 'DECORATIVE_EMISSIVE',
    role: 'DECORATIVE_EMISSIVE',
    label: 'Decorative emissive',
    hybridLighting: {
      main: { type: 'POINT', intensityRatio: 0.16, rangeM: 0.45, angleDeg: 90, penumbra: 1, castShadow: false, shadowPriority: 0 },
      fill: { enabled: false, type: 'POINT', localOffset: [0, 0, 0], intensityRatio: 0.02, rangeM: 0.4, castShadow: false },
      bouncePolicies: [{ role: 'NO_BOUNCE', enabled: false, intensityRatio: 0, rangeRatio: 0, colorMode: 'NEUTRAL' }],
    },
  },
  STRIP_PATH_HYBRID: {
    id: 'STRIP_PATH_HYBRID',
    role: 'STRIP_PATH',
    label: 'Strip path hybrid',
    hybridLighting: {
      main: { type: 'POINT', intensityRatio: 0.35, rangeM: 0.7, angleDeg: 90, penumbra: 1, castShadow: false, shadowPriority: 0 },
      fill: { enabled: true, type: 'POINT', localOffset: [0, 0, 0], intensityRatio: 0.06, rangeM: 0.6, castShadow: false },
      bouncePolicies: [{ role: 'WALL_BOUNCE', enabled: false, intensityRatio: 0.02, rangeRatio: 0.7, colorMode: 'SOURCE_TINTED' }],
    },
  },
};

export function presetForRole(role: LightingRole): RenderPresetId {
  for (const preset of Object.values(LIGHTING_PRESETS)) {
    if (preset.role === role) return preset.id;
  }
  return 'DESK_TASK_HYBRID';
}
