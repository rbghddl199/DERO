// 스튜디오 환경 — PMREM IBL(중립 HDRI) + 중립 회색 배경/바닥 + 재사용 소프트 컨택트 섀도우 텍스처, 캔버스는 색상 중립 유지(제품색 판단 왜곡 방지)
import * as THREE from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Neutral grey softbox studio (CC0, polyhaven.com/a/studio_small_09), 1k.
// Chosen for zero colour cast — the e2e wall R/B guard (0.9..1.12) must hold.
const HDRI_URL = '/assets/env/studio_small_09_1k.hdr';

/** ground 평면 한 변 길이(m) — 벽면 마감이 바닥 절차 재질을 계산할 때 읽는다(FinishContext). */
export const GROUND_SIZE_M = 60;

export interface EnvHandles {
  ground: THREE.Mesh;
}

export function setupEnvironment(scene: THREE.Scene, renderer: THREE.Renderer): EnvHandles {
  // Neutral PMREM IBL (equirect HDRI) is the sole environment source. Its
  // strength lives solely on the room-light toggle in scene.ts (setRoomLight) —
  // we deliberately set no environmentIntensity here, else it double-writes and
  // the value is dead on arrival the moment the room rig initialises.
  new HDRLoader().load(HDRI_URL, (equirect) => {
    const pmrem = new THREE.PMREMGenerator(renderer as never);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(equirect).texture;
    equirect.dispose();
    pmrem.dispose();
  });
  // Soft vertical studio-cyc gradient (neutral warm-grey): blends the wall/floor
  // seam so no hard horizon or cool background patch shows past the walls (W11).
  scene.background = makeBackdropTexture();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M),
    new THREE.MeshStandardNodeMaterial({ color: 0xdcdbd9, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  return { ground };
}

/** Vertical studio-cyc backdrop: darker warm-grey up top -> light warm-white at
 * the floor line, so the wall/background seam reads as a soft sweep, not a hard
 * horizon (W11). Neutral (no colour cast) per §1.5. */
function makeBackdropTexture(): THREE.CanvasTexture {
  const w = 8;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#dcdad7');
  g.addColorStop(0.6, '#e8e6e3');
  g.addColorStop(1, '#f2f0ed');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial alpha gradient — grounds an object even where shadow maps are weak. */
export function makeRadialShadowTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
