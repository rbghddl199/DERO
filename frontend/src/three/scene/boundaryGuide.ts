// 상판 경계 위반 가이드 — 상판 경계와 위반 아이템의 판정 사각형을 상판 위에 선으로 그린다
// (판정 입력은 화면 실루엣이 아니라 규격 박스라, 보여주지 않으면 왜 걸렸는지 알 수 없다)
import * as THREE from 'three/webgpu';
import type { RectXZ } from '../core/snap';

/** 상수색 오버레이 — 톤매핑 노출(CAMERA_EXPOSURE=1/20) 역보상 (src/three/CLAUDE.md). */
const EXPOSURE_GAIN = 20;
/** 저채도 — 3D 캔버스의 뉴트럴 톤을 물들이지 않는다 (DESIGN-SYSTEM §1.5). */
const DESK_COLOR = 0xb9b3a8; // 상판 경계: 중립 회백
const ITEM_COLOR = 0xc9793a; // 위반 아이템 판정 사각형: 저채도 주황
const DESK_OPACITY = 0.5;
const ITEM_OPACITY = 0.9;
/** 상판 상면에서 띄우는 높이 (m) — z-fighting 방지. */
const LIFT_M = 0.001;

export interface BoundaryGuide {
  group: THREE.Group;
  /** 상판 경계 + 위반 아이템의 판정 사각형을 띄운다. `itemRect`가 null이면 상판 경계만. */
  show: (deskRect: RectXZ, itemRect: RectXZ | null, topY: number) => void;
  hide: () => void;
  dispose: () => void;
}

/** 사각형 4변 = 정점 8개 고정. `show`는 이 버퍼 값만 갱신한다(재할당 없음). */
function rectGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  return geo;
}

function writeRect(geo: THREE.BufferGeometry, r: RectXZ, y: number): void {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = attr.array as Float32Array;
  const corners: [number, number][] = [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i];
    const [x2, z2] = corners[(i + 1) % 4];
    a[i * 6 + 0] = x1;
    a[i * 6 + 1] = y;
    a[i * 6 + 2] = z1;
    a[i * 6 + 3] = x2;
    a[i * 6 + 4] = y;
    a[i * 6 + 5] = z2;
  }
  attr.needsUpdate = true;
  // 안 부르면 초기(빈) 바운딩 스피어로 프러스텀 컬링돼 선이 안 보인다.
  geo.computeBoundingSphere();
}

export function createBoundaryGuide(): BoundaryGuide {
  const group = new THREE.Group();
  group.name = 'boundary-guide';
  group.visible = false;

  function material(color: number, opacity: number): THREE.LineBasicNodeMaterial {
    return new THREE.LineBasicNodeMaterial({
      color: new THREE.Color(color).multiplyScalar(EXPOSURE_GAIN),
      transparent: true,
      opacity,
      depthTest: false, // 아이템에 묻히면 경계를 못 읽는다
      depthWrite: false,
    });
  }

  const deskMat = material(DESK_COLOR, DESK_OPACITY);
  const itemMat = material(ITEM_COLOR, ITEM_OPACITY);
  const deskGeo = rectGeometry();
  const itemGeo = rectGeometry();
  const deskLine = new THREE.LineSegments(deskGeo, deskMat);
  const itemLine = new THREE.LineSegments(itemGeo, itemMat);
  for (const line of [deskLine, itemLine]) {
    line.renderOrder = 3; // 기즈모와 같은 층 (아웃라인 2 위)
    line.raycast = () => {}; // 선택·배치 레이캐스트를 방해하지 않는다
    group.add(line);
  }
  group.raycast = () => {};

  function show(deskRect: RectXZ, itemRect: RectXZ | null, topY: number): void {
    const y = topY + LIFT_M;
    writeRect(deskGeo, deskRect, y);
    if (itemRect) writeRect(itemGeo, itemRect, y);
    itemLine.visible = !!itemRect;
    group.visible = true;
  }

  function hide(): void {
    group.visible = false;
  }

  function dispose(): void {
    hide();
    group.remove(deskLine, itemLine);
    deskGeo.dispose();
    itemGeo.dispose();
    deskMat.dispose();
    itemMat.dispose();
  }

  return { group, show, hide, dispose };
}
