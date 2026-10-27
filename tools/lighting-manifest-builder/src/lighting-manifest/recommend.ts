import { LIGHTING_PRESETS, presetForRole } from './presets';
import type { LightManifest, LightingRole, ModelAnalysis, ProductSpecInput, Recommendation, Vec3 } from './types';

const ROLE_KEYWORDS: Record<LightingRole, string[]> = {
  DESK_TASK: ['desk', 'task', 'reading', 'clamp', 'stand', 'lamp', 'shade'],
  MONITOR_TASK: ['monitor', 'screen', 'bar', 'lightbar'],
  AMBIENT_POINT: ['ambient', 'mood', 'globe', 'sphere', 'mushroom', 'table'],
  AMBIENT_INDIRECT: ['wall', 'indirect', 'back', 'corner', 'uplight'],
  DECORATIVE_EMISSIVE: ['neon', 'sign', 'rgb', 'ring', 'decor', 'emissive'],
  STRIP_PATH: ['strip', 'rope', 'string', 'path', 'led'],
};

export function createDraftManifest(analysis: ModelAnalysis, spec: ProductSpecInput | null): LightManifest {
  const role = recommendLightingRole(analysis, spec);
  const presetId = presetForRole(role.value);
  const binding = recommendBinding(analysis, role.value);
  const materialBindings = recommendMaterialBindings(analysis);
  const confidence = round((role.confidence + binding.confidence) / 2);

  return {
    schemaVersion: '1.0.0',
    asset: { modelFile: 'model.normalized.glb', assetVersion: '1.0.0', coordinateSpace: 'NORMALIZED_MODEL_LOCAL', unit: 'METER' },
    classification: { lightingRole: role.value, renderPreset: presetId, confidence: role.confidence },
    binding: binding.value,
    materialBindings,
    hybridLighting: structuredClone(LIGHTING_PRESETS[presetId].hybridLighting),
    materialResponse: {
      emissive: { enabled: Boolean(materialBindings.emissiveSurfaceMesh ?? materialBindings.bulbMesh), meshNode: materialBindings.emissiveSurfaceMesh ?? materialBindings.bulbMesh, intensityRatio: 1 },
      translucentShade: { supported: Boolean(materialBindings.shadeMesh && hasTransparentShade(analysis, materialBindings.shadeMesh)), meshNode: materialBindings.shadeMesh, tintSource: 'BASE_COLOR', tintStrength: 0.3 },
    },
    controls: {
      brightness: { adjustable: spec?.brightnessAdjustable ?? true, type: spec?.brightnessControlType ?? (spec?.brightnessAdjustable === false ? 'FIXED' : 'CONTINUOUS'), stepCount: null },
      colorTemperature: { adjustable: spec?.colorTemperatureAdjustable ?? true, type: spec?.colorTemperatureControlType ?? (spec?.colorTemperatureAdjustable === false ? 'FIXED' : 'CONTINUOUS'), minK: spec?.colorTemperatureMinK ?? 2700, maxK: spec?.colorTemperatureMaxK ?? 6500, stepCount: null },
    },
    review: { generationMethod: 'RULE_BASED', confidence, status: 'AUTO_GENERATED', requiresReview: true },
    overrides: {},
  };
}

export function recommendLightingRole(analysis: ModelAnalysis, spec: ProductSpecInput | null): Recommendation<LightingRole> {
  const terms = [spec?.roleHint, spec?.category, ...analysis.nodes.map((n) => n.name), ...analysis.meshes.map((m) => m.name), ...analysis.materials.map((m) => m.name)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const scores = new Map<LightingRole, number>();
  const evidence: string[] = [];
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [LightingRole, string[]][]) {
    let score = 0;
    for (const keyword of keywords) {
      if (terms.includes(keyword)) {
        score += 1;
        evidence.push(`KEYWORD_${keyword.toUpperCase()}`);
      }
    }
    scores.set(role, score);
  }
  const [x, y, z] = analysis.modelSize;
  const horizontal = Math.max(x, z);
  if (horizontal > y * 2.2 && y < 0.25) addScore(scores, 'MONITOR_TASK', 2, evidence, 'LONG_THIN_BODY');
  if (y > horizontal * 1.5) addScore(scores, 'DESK_TASK', 1.5, evidence, 'TALL_BODY');
  if (analysis.emissiveCandidates.length > 0 && analysis.embeddedLights.length === 0) addScore(scores, 'DECORATIVE_EMISSIVE', 0.8, evidence, 'EMISSIVE_WITHOUT_LIGHT');
  if (analysis.assetLimitations.includes('SINGLE_MESH')) addScore(scores, 'AMBIENT_POINT', 0.6, evidence, 'SINGLE_MESH_SIMPLE_VOLUME');

  let best: LightingRole = 'DESK_TASK';
  let bestScore = -1;
  for (const [role, score] of scores) {
    if (score > bestScore) {
      best = role;
      bestScore = score;
    }
  }
  return { value: best, confidence: round(bestScore <= 0 ? 0.45 : Math.min(0.86, 0.45 + bestScore * 0.12)), requiresReview: true, method: 'RULE_BASED_ROLE_SCORE', evidence: [...new Set(evidence)].slice(0, 8) };
}

export function recommendBinding(analysis: ModelAnalysis, role: LightingRole): Recommendation<LightManifest['binding']> {
  const originAnchor = findAnchor(analysis.anchorNodes, ['LIGHT_ORIGIN', 'LIGHT_FRONT_ORIGIN']);
  const targetAnchor = findAnchor(analysis.anchorNodes, ['LIGHT_TARGET', 'LIGHT_FRONT_TARGET']);
  if (originAnchor) {
    return { value: { mode: 'MODEL_LOCAL', originNode: originAnchor, targetNode: targetAnchor, fallbackOrigin: fallbackOrigin(analysis, role), fallbackTarget: targetAnchor ? null : fallbackTarget(analysis, role) }, confidence: targetAnchor ? 0.9 : 0.78, requiresReview: true, method: 'ANCHOR_NODE', evidence: [originAnchor, targetAnchor].filter(Boolean) as string[] };
  }
  const embedded = analysis.embeddedLights[0];
  if (embedded) {
    return { value: { mode: 'MODEL_LOCAL', originNode: null, targetNode: null, fallbackOrigin: embedded.position, fallbackTarget: embedded.target ?? fallbackTarget(analysis, role) }, confidence: 0.72, requiresReview: true, method: 'EMBEDDED_LIGHT_TRANSFORM', evidence: [embedded.name] };
  }
  const emissiveName = analysis.emissiveCandidates[0]?.value;
  const emissiveMesh = emissiveName ? analysis.meshes.find((m) => m.nodeName === emissiveName || m.name === emissiveName) : null;
  if (emissiveMesh?.center) {
    return { value: { mode: 'MODEL_LOCAL', originNode: null, targetNode: null, fallbackOrigin: emissiveMesh.center, fallbackTarget: fallbackTarget(analysis, role) }, confidence: 0.62, requiresReview: true, method: 'EMISSIVE_MESH_CENTER', evidence: [emissiveMesh.name] };
  }
  return { value: { mode: 'MODEL_LOCAL', originNode: null, targetNode: null, fallbackOrigin: fallbackOrigin(analysis, role), fallbackTarget: fallbackTarget(analysis, role) }, confidence: 0.48, requiresReview: true, method: 'BOUNDING_BOX_FALLBACK', evidence: ['NO_LIGHT_ANCHOR'] };
}

export function recommendMaterialBindings(analysis: ModelAnalysis): LightManifest['materialBindings'] {
  const byRole = analysis.materialRoleCandidates;
  const emissive = byRole.EMISSIVE_SURFACE?.value ?? analysis.emissiveCandidates[0]?.value ?? null;
  return { bulbMesh: byRole.BULB?.value ?? emissive, shadeMesh: byRole.SHADE?.value ?? null, diffuserMesh: byRole.DIFFUSER?.value ?? null, emissiveSurfaceMesh: emissive };
}

function fallbackOrigin(analysis: ModelAnalysis, role: LightingRole): Vec3 {
  const box = analysis.boundingBox;
  if (!box) return [0, 0.5, 0];
  const center = analysis.modelCenter;
  if (role === 'AMBIENT_POINT' || role === 'DECORATIVE_EMISSIVE' || role === 'STRIP_PATH') return center;
  return [center[0], box.max[1] - analysis.modelSize[1] * (role === 'MONITOR_TASK' ? 0.25 : 0.12), center[2]];
}

function fallbackTarget(analysis: ModelAnalysis, role: LightingRole): Vec3 | null {
  if (role === 'AMBIENT_POINT' || role === 'DECORATIVE_EMISSIVE' || role === 'STRIP_PATH') return null;
  const box = analysis.boundingBox;
  if (!box) return [0, 0, 0.25];
  const center = analysis.modelCenter;
  const depth = Math.max(analysis.modelSize[2], 0.1);
  return role === 'AMBIENT_INDIRECT' ? [center[0], center[1], box.max[2] + depth * 0.7] : [center[0], box.min[1], center[2] + depth * 0.35];
}

function hasTransparentShade(analysis: ModelAnalysis, meshNode: string): boolean {
  const mesh = analysis.meshes.find((m) => m.name === meshNode || m.nodeName === meshNode);
  const material = mesh?.materialName ? analysis.materials.find((item) => item.name === mesh.materialName) : null;
  return Boolean(material && (material.transparent || material.transmission > 0 || material.alphaMode === 'BLEND'));
}

function findAnchor(anchorNodes: string[], names: string[]): string | null {
  for (const name of names) {
    const found = anchorNodes.find((anchor) => anchor.toUpperCase() === name);
    if (found) return found;
  }
  return null;
}

function addScore(scores: Map<LightingRole, number>, role: LightingRole, value: number, evidence: string[], reason: string): void {
  scores.set(role, (scores.get(role) ?? 0) + value);
  evidence.push(reason);
}

function round(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
