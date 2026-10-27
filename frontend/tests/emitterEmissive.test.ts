import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  applyEmitterEmissive,
  pokeEmissive,
  EMITTER_EMISSIVE_INTENSITY,
} from '../src/three/scene/emitterEmissive';

function mesh(name: string, isEmitterSurface: boolean): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardNodeMaterial({ color: 0x808080 }),
  );
  m.name = name;
  if (isEmitterSurface) m.userData.emitterSurface = true;
  return m;
}

function materialOf(m: THREE.Mesh): THREE.MeshStandardNodeMaterial {
  return m.material as THREE.MeshStandardNodeMaterial;
}

describe('applyEmitterEmissive', () => {
  it('paints only the flagged emitter surfaces when any mesh is flagged', () => {
    const root = new THREE.Group();
    const plate = mesh('plate', true);
    const shell = mesh('shell', false);
    root.add(plate, shell);

    applyEmitterEmissive(root, 0x33ccff);

    expect(materialOf(plate).emissive.getHex()).toBe(0x33ccff);
    expect(materialOf(plate).emissiveIntensity).toBe(EMITTER_EMISSIVE_INTENSITY);
    expect(materialOf(shell).emissive.getHex()).toBe(0x000000);
  });

  it('falls back to every mesh when nothing is flagged (GLB with no texel mask)', () => {
    const root = new THREE.Group();
    const a = mesh('a', false);
    const b = mesh('b', false);
    root.add(a, b);

    applyEmitterEmissive(root, 0xff0080);

    expect(materialOf(a).emissive.getHex()).toBe(0xff0080);
    expect(materialOf(b).emissive.getHex()).toBe(0xff0080);
  });

  it('updates the collision-tint restore baseline so releasing a tint keeps the glow', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);
    const mat = materialOf(m);
    // 틴트가 이미 한 번 걸렸다가 풀린 상태 — 기준선이 존재한다.
    mat.userData._origEmissive = 0x000000;
    mat.userData._origEmissiveI = 1;

    applyEmitterEmissive(root, 0x00ff00);

    expect(mat.userData._origEmissive).toBe(0x00ff00);
    expect(mat.userData._origEmissiveI).toBe(EMITTER_EMISSIVE_INTENSITY);
    expect(mat.emissive.getHex()).toBe(0x00ff00);
  });

  it('does not overwrite a live collision tint — only its baseline', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);
    const mat = materialOf(m);
    mat.userData._origEmissive = 0x000000;
    mat.userData._origEmissiveI = 1;
    mat.userData._tinted = true;
    mat.emissive.setHex(0x7a1f1a);
    mat.emissiveIntensity = 12;

    applyEmitterEmissive(root, 0x00ff00);

    expect(mat.emissive.getHex()).toBe(0x7a1f1a);
    expect(mat.emissiveIntensity).toBe(12);
    expect(mat.userData._origEmissive).toBe(0x00ff00);
  });

  it('turns the glow off with intensity 0 while keeping the colour for re-enabling', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);
    const mat = materialOf(m);
    applyEmitterEmissive(root, 0x33ccff);

    applyEmitterEmissive(root, 0x33ccff, 0);

    // 블룸이 읽는 채널은 emissive × intensity라 0이면 구조적으로 안 번진다.
    expect(mat.emissiveIntensity).toBe(0);
    // 색은 남는다 — 다시 켤 때 되돌릴 값이자, 꺼진 채로도 스와치가 정직해야 한다.
    expect(mat.emissive.getHex()).toBe(0x33ccff);
  });

  it('drops the collision-tint baseline to 0 too so releasing a tint keeps the glow off', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);
    const mat = materialOf(m);
    mat.userData._origEmissive = 0x33ccff;
    mat.userData._origEmissiveI = EMITTER_EMISSIVE_INTENSITY;

    applyEmitterEmissive(root, 0x33ccff, 0);

    expect(mat.userData._origEmissiveI).toBe(0);
  });

  it('leaves the baseline untouched when no tint has ever run (undefined stays undefined)', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);

    applyEmitterEmissive(root, 0x112233);

    expect(materialOf(m).userData._origEmissive).toBeUndefined();
  });
});

describe('pokeEmissive', () => {
  it('nudges emissiveIntensity by an invisible epsilon, alternating sign', () => {
    const root = new THREE.Group();
    const m = mesh('plate', true);
    root.add(m);
    applyEmitterEmissive(root, 0x33ccff);
    const mat = materialOf(m);

    pokeEmissive(root);
    const afterFirst = mat.emissiveIntensity;
    expect(afterFirst).toBeGreaterThan(EMITTER_EMISSIVE_INTENSITY);
    expect(afterFirst - EMITTER_EMISSIVE_INTENSITY).toBeLessThan(1e-3);

    pokeEmissive(root);
    // 왕복이라 값이 한쪽으로 흐르지 않는다 — 이게 상시 실행돼도 안전한 이유다.
    expect(mat.emissiveIntensity).toBeCloseTo(EMITTER_EMISSIVE_INTENSITY, 9);
  });
});
