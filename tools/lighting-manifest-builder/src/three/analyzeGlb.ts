import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Box3Lite, MaterialAnalysis, MeshAnalysis, ModelAnalysis, Recommendation, Vec3 } from '../lighting-manifest/types';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const anchorTerms = ['LIGHT_ORIGIN', 'LIGHT_TARGET', 'LIGHT_FRONT_ORIGIN', 'LIGHT_FRONT_TARGET', 'LIGHT_BACK_ORIGIN', 'LIGHT_BACK_TARGET', 'BULBMESH', 'LAMPSHADE', 'DIFFUSER', 'EMISSIVESURFACE'];

export async function analyzeGlbFile(file: File): Promise<ModelAnalysis> {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('GLB file is required.');
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    return analyzeLoadedGltf(gltf);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function analyzeLoadedGltf(gltf: GLTF): ModelAnalysis {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const nodes: ModelAnalysis['nodes'] = [];
  const meshes: MeshAnalysis[] = [];
  const materials = new Map<string, MaterialAnalysis>();
  const embeddedLights: ModelAnalysis['embeddedLights'] = [];
  const anchorNodes: string[] = [];
  const bounds = new THREE.Box3();
  let hasBox = false;
  let hasSkinOrRig = false;

  root.traverse((object) => {
    const path = objectPath(object);
    const isAnchor = isAnchorName(object.name);
    nodes.push({ name: object.name || object.type, path, depth: path.split('/').length - 1, childCount: object.children.length, isAnchor });
    if (isAnchor) anchorNodes.push(object.name);

    const light = object as THREE.Light;
    if (light.isLight) embeddedLights.push({ name: object.name || object.type, type: lightType(object), position: vec(object.position), target: null });

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) hasSkinOrRig = true;
    const box = meshBox(mesh, rootInverse);
    if (box) {
      bounds.union(new THREE.Box3(toThree(box.min), toThree(box.max)));
      hasBox = true;
    }
    const material = firstMaterial(mesh.material);
    if (material) materials.set(material.name || material.type, analyzeMaterial(material));
    meshes.push({ name: mesh.name || `mesh_${meshes.length}`, nodeName: object.name || `mesh_${meshes.length}`, materialName: material?.name || null, boundingBox: box, center: box ? center(box) : null, size: box ? size(box) : null });
  });

  const boundingBox = hasBox ? boxToLite(bounds) : null;
  const modelSize = boundingBox ? size(boundingBox) : [0, 0, 0] as Vec3;
  const modelCenter = boundingBox ? center(boundingBox) : [0, 0, 0] as Vec3;
  const materialList = [...materials.values()];
  const emissiveCandidates = recommendEmissive(meshes, materialList);
  const materialRoleCandidates = recommendRoles(meshes, materialList);
  const assetLimitations = limitations(meshes, materials.size, anchorNodes, modelSize, emissiveCandidates);

  return {
    meshCount: meshes.length,
    materialCount: materials.size,
    modelSize,
    modelCenter,
    boundingBox,
    boundingSphereRadius: Math.max(...modelSize) / 2,
    unit: likelyMeterScale(modelSize) ? 'METER' : 'UNKNOWN',
    upAxis: 'Y_UP',
    nodes,
    meshes,
    materials: materialList,
    embeddedLights,
    anchorNodes,
    emissiveCandidates,
    materialRoleCandidates,
    assetLimitations,
    warnings: assetLimitations.filter((item) => item !== 'SINGLE_MESH' && item !== 'SINGLE_MATERIAL'),
    hasAnimations: gltf.animations.length > 0,
    hasSkinOrRig,
  };
}

function analyzeMaterial(material: THREE.Material): MaterialAnalysis {
  const standard = material as THREE.MeshStandardMaterial & { transmission?: number };
  const color = standard.color instanceof THREE.Color ? standard.color : null;
  const emissive = standard.emissive instanceof THREE.Color ? standard.emissive : null;
  const opacity = material.opacity ?? 1;
  return {
    name: material.name || material.type,
    baseColor: color ? [color.r, color.g, color.b, opacity] : null,
    emissiveColor: emissive ? [emissive.r, emissive.g, emissive.b] : null,
    emissiveIntensity: standard.emissiveIntensity ?? 1,
    alphaMode: material.transparent || opacity < 1 ? 'BLEND' : material.alphaTest > 0 ? 'MASK' : 'OPAQUE',
    opacity,
    transparent: material.transparent || opacity < 1,
    transmission: standard.transmission ?? 0,
    doubleSided: material.side === THREE.DoubleSide,
    metallic: typeof standard.metalness === 'number' ? standard.metalness : null,
    roughness: typeof standard.roughness === 'number' ? standard.roughness : null,
  };
}

function recommendEmissive(meshes: MeshAnalysis[], materials: MaterialAnalysis[]): Recommendation<string>[] {
  const materialByName = new Map(materials.map((material) => [material.name, material]));
  return meshes
    .map((mesh) => {
      const material = mesh.materialName ? materialByName.get(mesh.materialName) : null;
      const c = material?.emissiveColor ?? [0, 0, 0];
      const luma = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      const nameHit = contains(`${mesh.name} ${mesh.nodeName} ${mesh.materialName ?? ''}`, ['emissive', 'led', 'light', 'glow', 'neon']);
      const confidence = Math.min(0.9, (luma > 0.03 ? 0.55 : 0) + (nameHit ? 0.2 : 0));
      return { value: mesh.nodeName, confidence: round(confidence), requiresReview: true, method: luma > 0.03 ? 'EMISSIVE_MATERIAL' : 'NAME_MATCH', evidence: [luma > 0.03 ? 'EMISSIVE_COLOR' : '', nameHit ? 'EMISSIVE_NAME' : ''].filter(Boolean) };
    })
    .filter((item) => item.confidence > 0.2)
    .sort((a, b) => b.confidence - a.confidence);
}

function recommendRoles(meshes: MeshAnalysis[], materials: MaterialAnalysis[]): Record<string, Recommendation<string | null>> {
  const terms: Record<string, string[]> = {
    BULB: ['bulb', 'lamp', 'led', 'tube'],
    SHADE: ['shade', 'lampshade', 'hood', 'shell'],
    DIFFUSER: ['diffuser', 'acrylic', 'cover', 'glass'],
    EMISSIVE_SURFACE: ['emissive', 'light', 'led', 'neon', 'glow'],
  };
  const materialByName = new Map(materials.map((material) => [material.name, material]));
  const out: Record<string, Recommendation<string | null>> = {};
  for (const [role, needles] of Object.entries(terms)) {
    let best: Recommendation<string | null> = { value: null, confidence: 0, requiresReview: true, method: 'NO_CANDIDATE', evidence: [] };
    for (const mesh of meshes) {
      const material = mesh.materialName ? materialByName.get(mesh.materialName) : null;
      const evidence: string[] = [];
      let score = contains(`${mesh.name} ${mesh.nodeName} ${mesh.materialName ?? ''}`, needles) ? 0.48 : 0;
      if (score > 0) evidence.push('NAME_MATCH');
      if ((role === 'SHADE' || role === 'DIFFUSER') && material && (material.transparent || material.transmission > 0)) {
        score += 0.24;
        evidence.push('TRANSPARENT_OR_TRANSMISSION');
      }
      if (role === 'EMISSIVE_SURFACE' && material?.emissiveColor && material.emissiveColor.some((v) => v > 0.03)) {
        score += 0.32;
        evidence.push('EMISSIVE_MATERIAL');
      }
      if (score > best.confidence) best = { value: mesh.nodeName, confidence: round(Math.min(0.9, score)), requiresReview: true, method: evidence.join('+') || 'RULE_BASED', evidence };
    }
    out[role] = best;
  }
  return out;
}

function limitations(meshes: MeshAnalysis[], materialCount: number, anchors: string[], modelSize: Vec3, emissive: Recommendation<string>[]): string[] {
  const out: string[] = [];
  if (meshes.length === 0) out.push('NO_MESH');
  if (materialCount === 0) out.push('NO_MATERIAL');
  if (meshes.length === 1) out.push('SINGLE_MESH', 'BULB_NOT_SEPARATED', 'SHADE_NOT_SEPARATED');
  if (materialCount === 1) out.push('SINGLE_MATERIAL');
  if (anchors.length === 0) out.push('NO_LIGHT_ANCHOR');
  if (emissive.length === 0) out.push('NO_EMISSIVE_MATERIAL');
  if (!likelyMeterScale(modelSize)) out.push('UNKNOWN_SCALE');
  if (Math.max(...modelSize) === 0) out.push('ZERO_SIZE_MODEL');
  return [...new Set(out)];
}

function meshBox(mesh: THREE.Mesh, rootInverse: THREE.Matrix4): Box3Lite | null {
  mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return null;
  const local = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  const box = mesh.geometry.boundingBox.clone().applyMatrix4(local);
  if (box.isEmpty()) return null;
  return boxToLite(box);
}

function boxToLite(box: THREE.Box3): Box3Lite {
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

function center(box: Box3Lite): Vec3 {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
}

function size(box: Box3Lite): Vec3 {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

function objectPath(object: THREE.Object3D): string {
  const names: string[] = [];
  for (let current: THREE.Object3D | null = object; current; current = current.parent) names.push(current.name || current.type);
  return names.reverse().join('/');
}

function isAnchorName(name: string): boolean {
  const normalized = name.toUpperCase().replaceAll('_', '');
  return anchorTerms.some((term) => normalized.includes(term.replaceAll('_', '')));
}

function lightType(object: THREE.Object3D): ModelAnalysis['embeddedLights'][number]['type'] {
  if ((object as THREE.PointLight).isPointLight) return 'POINT';
  if ((object as THREE.SpotLight).isSpotLight) return 'SPOT';
  if ((object as THREE.DirectionalLight).isDirectionalLight) return 'DIRECTIONAL';
  return 'UNKNOWN';
}

function firstMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | null {
  return Array.isArray(material) ? material[0] ?? null : material;
}

function vec(v: THREE.Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

function toThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function contains(value: string, needles: string[]): boolean {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function likelyMeterScale(size: Vec3): boolean {
  const max = Math.max(...size);
  return max > 0.01 && max < 8;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
