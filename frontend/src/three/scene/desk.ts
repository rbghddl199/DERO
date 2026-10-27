// DeskConfig(mm) 기반 절차형 책상 생성 — 상판+프레임(t-frame/four-leg/top-only), 제품 선택·직접 입력 모두 이 한 경로로 그리며 책상 GLB는 쓰지 않는다
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mmToM } from '../core/units';
import { materialForSkin } from '../render/materials';
import { deskMaterialSkin, type DeskConfig } from '../core/deskConfig';
import type { MaterialSkin } from './product';

const FRAME_SKIN: MaterialSkin = {
  class: 'metal',
  baseColor: 0x3a3a3d,
  roughness: 0.5,
  metalness: 0.35,
};

function frameMaterial(): THREE.MeshPhysicalNodeMaterial {
  return materialForSkin(FRAME_SKIN);
}

function addFourLegs(group: THREE.Group, w: number, d: number, legH: number): void {
  const mat = frameMaterial();
  const legT = 0.05;
  const inset = 0.07;
  const xs = [-w / 2 + inset + legT / 2, w / 2 - inset - legT / 2];
  const zs = [-d / 2 + inset + legT / 2, d / 2 - inset - legT / 2];
  for (const x of xs) {
    for (const z of zs) {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(legT, legH, legT, 3, 0.006), mat);
      leg.position.set(x, legH / 2, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);
    }
  }
}

/** T프레임: 좌·우 각각 세로 기둥 1 + 바닥 발판 1 (측면에서 보면 뒤집힌 T). */
function addTFrame(group: THREE.Group, w: number, d: number, legH: number): void {
  const mat = frameMaterial();
  const postT = 0.055;
  const footH = 0.028;
  const inset = 0.09;
  const footD = d * 0.78;
  const postH = Math.max(0.001, legH - footH);
  for (const x of [-w / 2 + inset, w / 2 - inset]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(postT, postH, postT, 3, 0.006), mat);
    post.position.set(x, footH + postH / 2, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    const foot = new THREE.Mesh(new RoundedBoxGeometry(postT * 1.6, footH, footD, 3, 0.006), mat);
    foot.position.set(x, footH / 2, 0);
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(post, foot);
  }
}

export function buildDesk(config: DeskConfig): THREE.Group {
  const w = mmToM(config.widthMm);
  const d = mmToM(config.depthMm);
  const h = mmToM(config.heightMm);
  const tt = mmToM(config.topThicknessMm);

  const group = new THREE.Group();

  const top = new THREE.Mesh(
    new RoundedBoxGeometry(w, tt, d, 4, Math.min(0.01, tt / 2)),
    materialForSkin(deskMaterialSkin(config)),
  );
  top.position.y = h - tt / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const legH = h - tt;
  if (config.frameType === 'four-leg') addFourLegs(group, w, d, legH);
  else if (config.frameType === 't-frame') addTFrame(group, w, d, legH);
  // 'top-only' = 프레임 없음 (벽 부착·기존 프레임 재사용 가정)

  group.userData.config = { ...config };
  group.userData.surfaceTopY = h;
  group.userData.surfaceHalfWidth = w / 2;
  group.userData.surfaceHalfDepth = d / 2;
  return group;
}
