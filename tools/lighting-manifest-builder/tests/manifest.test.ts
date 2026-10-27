import { describe, expect, it } from 'vitest';
import { createDraftManifest, recommendLightingRole } from '../src/lighting-manifest/recommend';
import { validateLightManifest } from '../src/lighting-manifest/validation';
import { createZipBlob, sanitizeZipPath } from '../src/lighting-manifest/zip';
import type { ModelAnalysis } from '../src/lighting-manifest/types';

const analysis: ModelAnalysis = {
  meshCount: 2,
  materialCount: 2,
  modelSize: [0.32, 0.72, 0.24],
  modelCenter: [0, 0.36, 0],
  boundingBox: { min: [-0.16, 0, -0.12], max: [0.16, 0.72, 0.12] },
  boundingSphereRadius: 0.36,
  unit: 'METER',
  upAxis: 'Y_UP',
  nodes: [
    { name: 'DeskLampRoot', path: 'DeskLampRoot', depth: 0, childCount: 1, isAnchor: false },
    { name: 'LIGHT_ORIGIN', path: 'DeskLampRoot/LIGHT_ORIGIN', depth: 1, childCount: 0, isAnchor: true },
  ],
  meshes: [
    { name: 'LampShade', nodeName: 'LampShade', materialName: 'shade', boundingBox: null, center: null, size: null },
    { name: 'BulbMesh', nodeName: 'BulbMesh', materialName: 'warm_emissive', boundingBox: null, center: [0, 0.54, 0], size: [0.08, 0.08, 0.08] },
  ],
  materials: [
    { name: 'shade', baseColor: [1, 0.9, 0.8, 0.55], emissiveColor: [0, 0, 0], emissiveIntensity: 1, alphaMode: 'BLEND', opacity: 0.55, transparent: true, transmission: 0.2, doubleSided: true, metallic: 0, roughness: 0.6 },
    { name: 'warm_emissive', baseColor: [1, 0.9, 0.6, 1], emissiveColor: [1, 0.65, 0.25], emissiveIntensity: 1, alphaMode: 'OPAQUE', opacity: 1, transparent: false, transmission: 0, doubleSided: false, metallic: 0, roughness: 0.3 },
  ],
  embeddedLights: [],
  anchorNodes: ['LIGHT_ORIGIN'],
  emissiveCandidates: [{ value: 'BulbMesh', confidence: 0.74, requiresReview: true, method: 'EMISSIVE_MATERIAL', evidence: ['EMISSIVE_COLOR'] }],
  materialRoleCandidates: {
    BULB: { value: 'BulbMesh', confidence: 0.8, requiresReview: true, method: 'NAME_MATCH', evidence: ['NAME_MATCH'] },
    SHADE: { value: 'LampShade', confidence: 0.72, requiresReview: true, method: 'NAME_MATCH', evidence: ['NAME_MATCH'] },
    DIFFUSER: { value: null, confidence: 0, requiresReview: true, method: 'NO_CANDIDATE', evidence: [] },
    EMISSIVE_SURFACE: { value: 'BulbMesh', confidence: 0.8, requiresReview: true, method: 'EMISSIVE_MATERIAL', evidence: ['EMISSIVE_COLOR'] },
  },
  assetLimitations: [],
  warnings: [],
  hasAnimations: false,
  hasSkinOrRig: false,
};

describe('manifest builder core', () => {
  it('creates a valid rule-based manifest', () => {
    const manifest = createDraftManifest(analysis, null);
    expect(manifest.classification.lightingRole).toBe('DESK_TASK');
    expect(manifest.binding.originNode).toBe('LIGHT_ORIGIN');
    expect(manifest.materialBindings.emissiveSurfaceMesh).toBe('BulbMesh');
    expect(validateLightManifest(manifest).valid).toBe(true);
  });

  it('keeps recommendations reviewable', () => {
    const role = recommendLightingRole(analysis, { category: 'desk reading lamp' });
    expect(role.requiresReview).toBe(true);
    expect(role.confidence).toBeGreaterThan(0);
    expect(role.confidence).toBeLessThanOrEqual(1);
  });

  it('reports invalid manifest ranges', () => {
    const manifest = createDraftManifest(analysis, null);
    manifest.hybridLighting.main.penumbra = 1.5;
    expect(validateLightManifest(manifest).issues.map((issue) => issue.code)).toContain('OUT_OF_RANGE');
  });

  it('creates a zip blob and sanitizes paths', async () => {
    expect(sanitizeZipPath('../job/light.manifest.json')).toBe('job/light.manifest.json');
    const blob = await createZipBlob([{ path: 'job/light.manifest.json', data: '{"ok":true}' }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
