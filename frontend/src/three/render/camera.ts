// 카메라: 고정 프리셋 5종(키보드 전환) + 자유 궤도 회전 — 줌은 확인용일 뿐 리스케일 아님, 바닥 아래로 안 내려가게 클램프
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type PresetName = 'hero' | 'first-person' | 'front' | 'back' | 'side' | 'top';

export interface PresetPose {
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<PresetName, PresetPose> = {
  hero: { position: [1.95, 1.5, 2.15], target: [0, 0.85, 0] },
  'first-person': { position: [0, 1.28, 1.4], target: [0, 0.98, -0.5] },
  front: { position: [0, 1.2, 2.7], target: [0, 0.9, 0] },
  back: { position: [0, 1.2, -2.7], target: [0, 0.9, 0] },
  side: { position: [2.8, 1.2, 0.02], target: [0, 0.9, 0] },
  top: { position: [0.02, 3.3, 0.03], target: [0, 0.74, 0] },
};

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.05, 100);
  const p = CAMERA_PRESETS.hero;
  cam.position.set(...p.position);
  cam.lookAt(...p.target);
  return cam;
}

export function createControls(camera: THREE.PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.7;
  controls.maxDistance = 6.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.035; // never under the floor
  controls.target.set(...CAMERA_PRESETS.hero.target);
  controls.update();
  return controls;
}

let activeTween = 0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Eased tween to a preset. Returns the target pose (also used by test hooks). */
export function tweenToPreset(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  name: PresetName,
  durationMs = 650,
): PresetPose {
  const pose = CAMERA_PRESETS[name];
  const token = ++activeTween;
  const startPos = camera.position.clone();
  const startTgt = controls.target.clone();
  const endPos = new THREE.Vector3(...pose.position);
  const endTgt = new THREE.Vector3(...pose.target);
  const t0 = performance.now();

  function step(now: number): void {
    if (token !== activeTween) return;
    const k = Math.min(1, (now - t0) / durationMs);
    const e = easeInOutCubic(k);
    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTgt, endTgt, e);
    controls.update();
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return pose;
}
