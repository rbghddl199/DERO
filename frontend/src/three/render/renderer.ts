// WebGPURenderer + WebGL2 자동 폴백(헤드리스 Playwright는 WebGL2로 실행)
import * as THREE from 'three/webgpu';

/**
 * One-time physical-light calibration (2026-07-18): the spec DB feeds REAL
 * rated lumens to SpotLight.power (SI: 1u=1m, decay=2), so the camera exposure
 * — not per-product data — maps physical light levels to display brightness.
 * Every scene light/emissive intensity is authored at 20x its previous value
 * with exposure 1/20, which is pixel-identical (exposure is a linear pre-tonemap
 * multiplier) while letting a ~400-800 lm product render in balance as-is.
 */
export const CAMERA_EXPOSURE = 1 / 20;

export async function createRenderer(
  canvas: HTMLCanvasElement,
  options?: { alpha?: boolean },
): Promise<THREE.WebGPURenderer> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: options?.alpha ?? false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // ACES Filmic tone mapping (three.js studio-example baseline): filmic highlight
  // roll-off + toe give physically-lit scenes their photographic contrast. Its
  // highlight desaturation is intentional here — the warm lamp pool still reads
  // warm while over-bright speculars roll to white instead of clipping hard.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CAMERA_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // outputColorSpace defaults to sRGB in r185.
  await renderer.init();
  return renderer;
}

export function backendName(renderer: THREE.WebGPURenderer): 'webgl' | 'webgpu' {
  return (renderer.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend
    ? 'webgl'
    : 'webgpu';
}
