// 절차형 제품 메쉬 — 바닥 원점(y=0)에서 규격 높이까지, 클래스 전반 일관된 클레이 톤으로 규격 바운딩 박스(mm) 안에 그림
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mmToM } from '../core/units';
import { materialForSkin } from '../render/materials';
import { SHADE_MESH_NAME } from '../render/cookieBake';
import { colorTempToRGB } from './lighting';
import type { ProductCategory, ProductSpec } from './product';
import {
  panelSizeMm,
  screenSizeMm,
  MONITOR_PANEL_THICKNESS_MM,
  MONITOR_STAND_HEIGHT_MM,
  MONITOR_STAND_WIDTH_MM,
  MONITOR_STAND_FOOT_HEIGHT_MM,
} from './monitor';

/** 램프 갓 발광 기준 세기 — physical-lumen 스케일(renderer CAMERA_EXPOSURE) 캘리브레이션 값.
 *  갓을 만드는 이곳이 정본이고, 사용자 밝기 배율은 여기에 곱해 실시간 반영한다
 *  (`scene.ts` `syncLampShadeEmissive`, 287). 두 곳에 손으로 복제하지 말 것. */
export const LAMP_SHADE_EMISSIVE_INTENSITY = 18;

function accent(color: number, roughness = 0.5, metalness = 0.1): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color, roughness, metalness });
}

/** Dim "powered-on" monitor screen: dark panel with a soft cool desktop glow
 * low-centre. Self-lit (emissiveMap) so it reads alive, not dead black — kept
 * dim & desaturated so it never distorts product-colour perception or the mood. */
function makeScreenTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 160;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d0f13';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.64, 0, w * 0.5, h * 0.64, h * 0.95);
  g.addColorStop(0, 'rgba(122,142,168,0.55)');
  g.addColorStop(0.5, 'rgba(64,78,98,0.22)');
  g.addColorStop(1, 'rgba(18,22,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 곡면 패널 한 겹 — 반경 R 원통 옆면의 일부. 뷰어는 +Z에서 본다. */
function curvedShell(
  radiusM: number,
  heightM: number,
  widthM: number,
  mat: THREE.Material,
  centerZ: number,
): THREE.Mesh {
  const theta = widthM / radiusM; // 호 길이 = 폭
  // 곡률 중심을 화면 앞(+Z, centerZ)에 두고 먼 쪽 호(θ≈π)를 쓰면 양끝이 뷰어 쪽으로
  // 감기는 오목 화면이 된다. 중심을 공유해야 화면/하우징 간격 = 반경 차 = 두께.
  // (three CylinderGeometry는 θ=0이 +Z: x = R·sinθ, z = R·cosθ)
  const geo = new THREE.CylinderGeometry(
    radiusM,
    radiusM,
    heightM,
    64,
    1,
    true,
    Math.PI - theta / 2,
    theta,
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = centerZ;
  return mesh;
}

export function buildProp(spec: ProductSpec, opts?: { hideStand?: boolean }): THREE.Group {
  const g = new THREE.Group();
  const body = materialForSkin(spec.material);
  const w = mmToM(spec.widthMm);
  const d = mmToM(spec.depthMm);
  const h = mmToM(spec.heightMm);

  // 실 카탈로그 스펙(category 없음, categoryId/categoryName만 있음)도 모니터·램프 절차 생성
  // 분기를 타야 한다 — 특히 모니터는 이 분기에서만 mountLocal(암 VESA 자석 결합 기준점,
  // scene.ts tryMountMonitor)을 채운다. spec.monitor/spec.kind는 mock/real 공용 판별자.
  const proceduralKind: ProductCategory | undefined =
    spec.category ?? (spec.monitor ? 'monitor' : spec.kind === 'lamp' ? 'lamp' : undefined);

  switch (proceduralKind) {
    case 'monitor': {
      const m = spec.monitor;
      if (!m) {
        // 규격 없는 모니터 = 데이터 오류. 씬을 죽이지 않게 기본 박스로 떨어뜨린다.
        const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.008), body);
        box.position.y = h / 2;
        box.castShadow = true;
        g.add(box);
        break;
      }

      const panel = panelSizeMm(m);
      const screen = screenSizeMm(m.diagonalInch, m.aspectRatio);
      const panelW = mmToM(panel.widthMm);
      const panelH = mmToM(panel.heightMm);
      const screenW = mmToM(screen.widthMm);
      const screenH = mmToM(screen.heightMm);
      const thickness = mmToM(MONITOR_PANEL_THICKNESS_MM);
      const standH = mmToM(MONITOR_STAND_HEIGHT_MM);
      const standW = mmToM(MONITOR_STAND_WIDTH_MM);
      // 스탠드 깊이는 제품별 규격값 — 규격 DB(monitorDims)와 메쉬가 갈라지면 안 된다
      const standD = mmToM(m.standDepthMm);
      const panelCenterY = standH + panelH / 2;

      // Dim powered-on display: dark panel + soft self-lit desktop glow. Reads
      // alive (not dead pure-black) but stays dim/desaturated so it never casts a
      // tint that distorts product colour (§1.5) or the mood R/B gate.
      const screenTex = makeScreenTexture();
      const screenMat = new THREE.MeshStandardNodeMaterial({
        color: 0x0d0f13,
        roughness: 0.16,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      screenMat.map = screenTex;
      screenMat.emissive = new THREE.Color(0xffffff);
      screenMat.emissiveMap = screenTex;
      screenMat.emissiveIntensity = 11; // physical-lumen scale (renderer CAMERA_EXPOSURE)

      let back: THREE.Mesh;
      let screenMesh: THREE.Mesh;
      if (m.panelShape === 'curved' && (m.curvatureRadiusMm ?? 0) > 0) {
        const radiusM = mmToM(m.curvatureRadiusMm!);
        // 곡률 중심을 공유(centerZ = radiusM)해야 하우징이 화면 뒤로 정확히 thickness 만큼 물러난다.
        back = curvedShell(radiusM + thickness, panelH, panelW, body, radiusM);
        screenMesh = curvedShell(radiusM, screenH, screenW, screenMat, radiusM);
        back.position.y = panelCenterY;
        screenMesh.position.y = panelCenterY;
      } else {
        back = new THREE.Mesh(new RoundedBoxGeometry(panelW, panelH, thickness, 4, 0.01), body);
        back.position.set(0, panelCenterY, 0);
        screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
        screenMesh.position.set(0, panelCenterY, thickness / 2 + 0.0005);
      }
      // 사용자 사진 교체용 마킹 — 이름이 아니라 플래그다(파트 개명에 안 깨진다, 아래 키보드
      // plate.userData.emitterSurface와 같은 규약). aspect는 규격 파생값이라 메쉬를 재지 않는다.
      screenMesh.userData.screenSurface = true;
      screenMesh.userData.screenAspect = screenW / screenH;
      screenMesh.userData.defaultScreenTexture = screenTex;

      g.add(back, screenMesh);

      // 스탠드 — VESA로 암에 물리면 통째로 숨긴다 (설계 §2.4)
      const stand = new THREE.Group();
      // 발판 두께는 지지면 판정과 공유하는 상수다 — 여기서 리터럴로 되돌리면
      // 모니터 밑에 놓은 아이템의 얹힘 높이가 메쉬와 갈라진다 (monitor.ts monitorStandFootMm).
      const footH = mmToM(MONITOR_STAND_FOOT_HEIGHT_MM);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(standW, footH, standD, 3, 0.006), body);
      foot.position.y = footH / 2;
      const neck = new THREE.Mesh(
        new RoundedBoxGeometry(0.035, standH - footH, 0.03, 3, 0.006),
        body,
      );
      neck.position.y = footH / 2 + (standH - footH) / 2;
      stand.add(foot, neck);
      stand.visible = !opts?.hideStand;
      g.add(stand);
      g.userData.standGroup = stand;
      // 자석 결합 기준점 (D22) — 패널 뒷면 중앙의 로컬 좌표. 암 head-mount 앵커에
      // 이 점을 맞춘다. 곡면은 하우징이 곡률 중심을 공유해 중앙에서 두께만큼 물러난다
      // (평면은 박스 중심이라 두께의 절반).
      g.userData.mountLocal = new THREE.Vector3(
        0,
        panelCenterY,
        m.panelShape === 'curved' && (m.curvatureRadiusMm ?? 0) > 0 ? -thickness : -thickness / 2,
      );

      // 화면은 캐스터에서 제외 — 하우징 바로 앞의 얇은 면이라 shadow acne가 난다.
      for (const mesh of [back, foot, neck]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      break;
    }
    case 'keyboard': {
      const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(0.008, h / 2)), body);
      slab.position.y = h / 2;
      slab.castShadow = true;
      slab.receiveShadow = true;
      const plate = new THREE.Mesh(
        new RoundedBoxGeometry(w - 0.02, 0.006, d - 0.02, 3, 0.003),
        accent(0x1c1e22, 0.6, 0),
      );
      plate.position.y = h - 0.002;
      // 백라이트는 키캡 아래 이 플레이트에서만 샌다 — 케이스(slab)는 빛나지 않는다.
      // 이름이 아니라 플래그인 이유: 이름 의존은 rig_manifest가 파트 개명에 깨진
      // 그 취약성이고, erd.md가 발광 매니페스트를 일부러 노드 이름과 안 묶었다.
      plate.userData.emitterSurface = true;
      g.add(slab, plate);
      break;
    }
    case 'speaker': {
      const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.012), body);
      box.position.y = h / 2;
      box.castShadow = true;
      box.receiveShadow = true;
      const driver = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24),
        accent(0x111112, 0.4, 0.2),
      );
      driver.rotation.x = Math.PI / 2;
      driver.position.set(0, h * 0.42, d / 2 + 0.002);
      const tweeter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.012, 20),
        accent(0x161618, 0.35, 0.2),
      );
      tweeter.rotation.x = Math.PI / 2;
      tweeter.position.set(0, h * 0.72, d / 2 + 0.002);
      g.add(box, driver, tweeter);
      break;
    }
    case 'water-bottle': {
      const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h - 0.055, 32), body);
      bodyM.position.y = (h - 0.055) / 2;
      bodyM.castShadow = true;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2 - 0.006, w / 2 - 0.006, 0.05, 32),
        accent(0x2b2d31, 0.5, 0.3),
      );
      cap.position.y = h - 0.028;
      g.add(bodyM, cap);
      break;
    }
    case 'mug': {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 - 0.006, h, 32), body);
      cup.position.y = h / 2;
      cup.castShadow = true;
      cup.receiveShadow = true;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 12, 24), body);
      handle.position.set(w / 2 - 0.004, h * 0.5, 0);
      handle.rotation.y = Math.PI / 2;
      g.add(cup, handle);
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2 - 0.01, w / 2 - 0.02, 0.13, 28),
        body,
      );
      pot.position.y = 0.065;
      pot.castShadow = true;
      pot.receiveShadow = true;
      const foliageMat = accent(0x5c7d4f, 0.85, 0);
      const positions: [number, number, number, number][] = [
        [0, 0.2, 0, 0.085],
        [0.05, 0.16, 0.03, 0.06],
        [-0.045, 0.17, -0.02, 0.055],
      ];
      for (const [x, y, z, r] of positions) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), foliageMat);
        leaf.position.set(x, y, z);
        leaf.castShadow = true;
        g.add(leaf);
      }
      g.add(pot);
      break;
    }
    case 'lamp': {
      const k = spec.optical?.colorTempK ?? 3000;
      const rgb = colorTempToRGB(k);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.022, 32), body);
      base.position.y = 0.011;
      base.castShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h - 0.14, 20), body);
      pole.position.y = (h - 0.14) / 2;
      const shadeMat = new THREE.MeshStandardNodeMaterial({
        color: spec.material.baseColor,
        roughness: 0.5,
        metalness: 0.1,
      });
      shadeMat.emissive = new THREE.Color().setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
      shadeMat.emissiveIntensity = LAMP_SHADE_EMISSIVE_INTENSITY;
      // 갓 아랫반경 0.075 · 깊이 0.20 은 장식이 아니라 쿠키 제약이다 — 광원이 갓 윗구멍
      // (`lightSlots.ts`)에 있을 때 빛이 갓에 닿기 시작하는 각이 atan(0.075/0.20) = 20.6°로
      // flood 빔 반각 40.1° 안에 든다. 얕게(옛 0.092/0.10 = 61.5°) 되돌리면 빛이 갓을 아예
      // 스치지 않아 무늬가 통째로 사라진다. spot 빔(18.3°)은 이 각 밖이라 원래 무늬가 없다.
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.075, 0.2, 28, 1, true),
        shadeMat,
      );
      shade.name = SHADE_MESH_NAME; // 쿠키 베이크가 이 이름으로 갓만 골라 굽는다 (DERO-265)
      shade.position.y = h - 0.11;
      shade.rotation.z = 0.12;
      g.add(base, pole, shade);
      break;
    }
    default: {
      const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.008), body);
      box.position.y = h / 2;
      box.castShadow = true;
      g.add(box);
    }
  }

  g.userData.spec = spec;
  return g;
}
