// 공간 충돌 (REQ-SIM-04) — three-aware, 메쉬당 OBB + SAT.
// 2계층 분리(2026-07-21 설계 스펙): 호환성 판정은 collision.ts(규격 DB 전용),
// 공간 겹침 피드백은 이 모듈(시뮬레이터 지오메트리 참조 OK — D7/D8 비대상).
// 메쉬당 OBB 1개: mesh.matrixWorld가 FK 피벗 회전을 포함하므로 포즈 반영이 공짜.
import * as THREE from 'three/webgpu';
import { OBB } from 'three/addons/math/OBB.js';
import type { RectXZ } from './snap';

/** 접촉 허용 오차(m) — 박스를 면당 이만큼 줄여 밀착 배치·스태킹 접촉이
 *  충돌로 잡히지 않게 한다 (기존 AABB edge-touch=false 규약 계승). */
const CONTACT_EPS = 0.0005;

export interface ColliderPart {
  mesh: THREE.Mesh;
  /** 메쉬 로컬 rest 바운즈 (CONTACT_EPS만큼 축소, 납작 지오메트리 안전) */
  localBox: THREE.Box3;
}

export interface ItemCollider {
  parts: ColliderPart[];
}

function shrunkBox(geom: THREE.BufferGeometry): THREE.Box3 {
  if (!geom.boundingBox) geom.computeBoundingBox();
  const box = geom.boundingBox!.clone();
  const size = new THREE.Vector3();
  box.getSize(size);
  // 축소량은 축 크기의 1/4 상한 — 납작한 판(스크린 PlaneGeometry, 4mm 매트)이
  // 음수 크기로 뒤집히지 않게 한다.
  box.expandByVector(
    new THREE.Vector3(
      -Math.min(CONTACT_EPS, size.x / 4),
      -Math.min(CONTACT_EPS, size.y / 4),
      -Math.min(CONTACT_EPS, size.z / 4),
    ),
  );
  return box;
}

/** 그룹 하위 모든 메쉬에 파트 1개씩. 라이트·피벗 등 비메쉬 노드는 무시.
 *  숨긴 메쉬(VESA 결합 시 모니터 스탠드)는 화면에 없으므로 충돌에서도 뺀다. */
export function buildItemCollider(group: THREE.Object3D): ItemCollider {
  const parts: ColliderPart[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (!node.visible) return;
      node = node.parent;
    }
    parts.push({ mesh, localBox: shrunkBox(mesh.geometry) });
  });
  return { parts };
}

function worldOBB(part: ColliderPart, target: OBB): OBB {
  part.mesh.updateWorldMatrix(true, false);
  target.fromBox3(part.localBox);
  target.applyMatrix4(part.mesh.matrixWorld);
  // OBB.applyMatrix4 (three addon) rotates the axes and scales halfSize, but for
  // the centre it only ADDS the matrix translation — it never rotates/scales the
  // box centre. That is correct only when the geometry box is centred on the mesh
  // origin. Meshopt + KHR_mesh_quantization assets (GLB 소품) keep positions in raw
  // integer units with the dequantization scale on the node matrix, so
  // geometry.boundingBox is centred thousands of units from origin and the OBB
  // lands far off the mesh. Recompute the world centre with the full transform.
  part.localBox.getCenter(target.center).applyMatrix4(part.mesh.matrixWorld);
  return target;
}

const _obbA = new OBB();
const _obbB = new OBB();

/** 겹침 관용치(m) — 판정용 OBB 반크기를 축마다 이만큼 줄인다. 양쪽이 함께 줄어드니
 *  실질 10mm 남짓 미만의 겹침은 충돌로 잡히지 않는다("접촉 허용 오차로 밀착·스태킹
 *  접촉은 충돌 아님", docs/context/3d-scene.md 배치·충돌 — 그동안 관용치가 0이라
 *  약속만 있고 구현이 없었다. 위 CONTACT_EPS 0.5mm가 이미 빠져 있어 실효 문턱은
 *  2×(5 + 0.5) = 11mm다).
 *  three `OBB.intersectsOBB(obb, epsilon)`의 두 번째 인자로는 못 한다 — 그 epsilon은
 *  관통 여유가 아니라 평행축 퇴화 가드라, 키우면 교차를 오히려 **더** 보고한다. */
const OVERLAP_TOLERANCE_M = 0.005;

/** 축별 수축 상한 = 그 축 반크기의 40%. 얇은 파트가 수축으로 음수 반크기가 되어
 *  판정에서 통째로 사라지는 것을 막는다 — 카탈로그 최박 파트는 아이패드(204)의
 *  두께 7mm(반크기 3.5mm)라 5mm를 그대로 빼면 음수다. 40%면 항상 원 두께의 20%가
 *  남고(3.5mm → 2.1mm), 관용치가 두께에 비례해 줄 뿐 판정은 살아 있다. */
const SHRINK_RATIO_CAP = 0.4;

/** 관용치만큼 OBB 반크기를 깎는다 — `collideItems` 전용이다. `worldOBB`·
 *  `footprintRectXZ` 등 다른 용도의 OBB는 실치수 그대로여야 한다. */
function shrinkForTolerance(obb: OBB): OBB {
  const h = obb.halfSize;
  h.x -= Math.min(OVERLAP_TOLERANCE_M, h.x * SHRINK_RATIO_CAP);
  h.y -= Math.min(OVERLAP_TOLERANCE_M, h.y * SHRINK_RATIO_CAP);
  h.z -= Math.min(OVERLAP_TOLERANCE_M, h.z * SHRINK_RATIO_CAP);
  return obb;
}

/** SAT 교차: 두 아이템에서 서로 겹치는 파트 목록 (빈 배열 = 충돌 없음). */
export function collideItems(
  a: ItemCollider,
  b: ItemCollider,
): { a: ColliderPart[]; b: ColliderPart[] } {
  const hitA = new Set<ColliderPart>();
  const hitB = new Set<ColliderPart>();
  for (const pa of a.parts) {
    shrinkForTolerance(worldOBB(pa, _obbA));
    for (const pb of b.parts) {
      shrinkForTolerance(worldOBB(pb, _obbB));
      if (_obbA.intersectsOBB(_obbB, 0)) {
        hitA.add(pa);
        hitB.add(pb);
      }
    }
  }
  return { a: [...hitA], b: [...hitB] };
}

const _obb = new OBB();
const _corner = new THREE.Vector3();

/** 파트 집합의 월드 OBB 코너 8점을 XZ로 투영한 footprint 사각형. */
export function footprintRectXZ(parts: ColliderPart[]): RectXZ | null {
  if (!parts.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of parts) {
    worldOBB(p, _obb);
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sy = -1; sy <= 1; sy += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          _corner
            .set(_obb.halfSize.x * sx, _obb.halfSize.y * sy, _obb.halfSize.z * sz)
            .applyMatrix3(_obb.rotation)
            .add(_obb.center);
          minX = Math.min(minX, _corner.x);
          maxX = Math.max(maxX, _corner.x);
          minZ = Math.min(minZ, _corner.z);
          maxZ = Math.max(maxZ, _corner.z);
        }
      }
    }
  }
  return { minX, maxX, minZ, maxZ };
}
