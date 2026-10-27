// 관절 조작 gizmo — 축별 색 링/화살촉(호버·드래그 피드백 포함)을 띄우고 레이캐스트로 집는다
import * as THREE from 'three/webgpu';
import type { JointHandle } from './scene';
import { dominantAxis, type Vec3 } from '../core/gizmoMath';

type AxisKey = 'x' | 'y' | 'z';

/** 상수색 오버레이 — 톤매핑 노출(CAMERA_EXPOSURE=1/20) 역보상 (src/three/CLAUDE.md). */
const EXPOSURE_GAIN = 20;
/** 축별 색 — 채도를 낮춰 3D 캔버스의 뉴트럴 톤을 물들이지 않는다(DESIGN-SYSTEM §1.5).
 *  판정 시맨틱 색(충돌 0x7a1f1a·경계 주황)과 겹치지 않게 코랄은 특히 저채도로. */
const AXIS_COLOR: Record<AxisKey, number> = {
  x: 0xd9917c, // 코랄
  y: 0x82bfa8, // 민트
  z: 0x9c90dd, // 라벤더 (기존 primary 0x8b7cf6보다 연하게)
};
const RING_RADIUS_M = 0.045; // 크기는 유지 지시 — 굵기·불투명도·색만 바꾼다
const RING_TUBE_M = 0.0018;
const TRACK_RADIUS_M = 0.0016;
const ARROW_RADIUS_M = 0.006;
const ARROW_HEIGHT_M = 0.015;
const HOVER_SCALE = 1.6; // 호버 시 굵기 배율
const HOVER_GLOW_GAIN = 1.35; // 호버 시 노출 배율 위에 얹는 "약한 발광"
const OPACITY_NORMAL = 0.55;
const OPACITY_HOVER = 1.0;
const ARC_WIDTH_M = 0.006; // 가동범위 호 두께(안/밖으로)
const ARC_OPACITY = 0.22;
const LABEL_LIFT_M = 0.055; // 현재값 라벨을 링/화살촉 위로 띄우는 오프셋

interface HandleMeshes {
  kind: JointHandle['kind'];
  axisKey: AxisKey;
  /** 레이캐스트 대상 — revolute는 링, prismatic은 화살촉(현재 값 위치). */
  primary: THREE.Mesh;
  primaryNormalGeo: THREE.BufferGeometry;
  primaryHoverGeo: THREE.BufferGeometry;
  /** prismatic 전용 — 고정 트랙(레이캐스트 대상에도 포함). */
  track?: THREE.Mesh;
  trackNormalGeo?: THREE.BufferGeometry;
  trackHoverGeo?: THREE.BufferGeometry;
}

export interface JointGizmo {
  group: THREE.Group;
  /** 핸들을 (재)생성해 띄운다. */
  show: (handles: JointHandle[]) => void;
  hide: () => void;
  /** 포즈가 바뀐 뒤 위치·방향을 갱신한다(재생성 없음). `activeJointId`를 주면
   *  드래그 시각 피드백(가동범위 호·현재값 라벨)도 함께 갱신한다 — `null`이면
   *  숨기고, 생략하면 드래그 상태를 건드리지 않는다(선택 아이템 상시 sync용). */
  sync: (handles: JointHandle[], activeJointId?: string | null) => void;
  /** 이미 setFromCamera된 raycaster로 핸들을 집는다. 없으면 null. */
  pick: (raycaster: THREE.Raycaster) => string | null;
  /** 호버 중인 관절(rAF 스로틀 hover 루프가 부른다). null=해제. */
  setHovered: (jointId: string | null) => void;
  /** 공유 머티리얼·라벨 텍스처까지 전부 해제한다(언마운트용). */
  dispose: () => void;
}

/** point/axis를 직접 받는 버전 — 트랙처럼 handle.point(이동 위치)가 아닌
 *  별도로 계산한 고정 앵커에 맞춰야 하는 메쉬에 쓴다. */
function orientAt(obj: THREE.Object3D, point: Vec3, axis: Vec3): void {
  obj.position.set(point[0], point[1], point[2]);
  // 링·막대 지오메트리의 로컬 축은 +Y다 — 관절 축으로 돌린다.
  obj.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...axis).normalize(),
  );
}

function orient(obj: THREE.Object3D, handle: JointHandle): void {
  orientAt(obj, handle.point, handle.axis);
}

// trackWorldCenter는 RenderLoop의 상시 sync 경로에서 선택된 prismatic 핸들마다
// 매 프레임 불린다 — 프레임당 new THREE.Vector3()를 피하려고 스크래치 버퍼를 재사용한다
// (코드리뷰 지적: 기존엔 호출마다 Vector3 4개가 새로 생겼다).
const scratchAxis = new THREE.Vector3();
const scratchRest = new THREE.Vector3();
const scratchStart = new THREE.Vector3();
const scratchEnd = new THREE.Vector3();

/** prismatic 고정 트랙의 월드 중심점 — handle.point(현재 값 위치)에서 axis 방향으로
 *  value/1000만큼 거꾸로 밀어 restPos 월드 앵커를 복원한 뒤 min~max 중점을 낸다.
 *  피벗 자체가 이동/회전해도(부모 체인 포함) 매 sync마다 다시 계산해 따라간다. */
function trackWorldCenter(h: JointHandle): { point: Vec3; axis: Vec3 } {
  scratchAxis.set(h.axis[0], h.axis[1], h.axis[2]).normalize();
  scratchRest.set(h.point[0], h.point[1], h.point[2]).addScaledVector(scratchAxis, -h.value / 1000);
  scratchStart.copy(scratchRest).addScaledVector(scratchAxis, h.min / 1000);
  scratchEnd.copy(scratchRest).addScaledVector(scratchAxis, h.max / 1000);
  const cx = (scratchStart.x + scratchEnd.x) / 2;
  const cy = (scratchStart.y + scratchEnd.y) / 2;
  const cz = (scratchStart.z + scratchEnd.z) / 2;
  return { point: [cx, cy, cz], axis: h.axis };
}

function trackLengthM(h: JointHandle): number {
  return Math.max((h.max - h.min) / 1000, 0.001);
}

export function createJointGizmo(): JointGizmo {
  const group = new THREE.Group();
  group.name = 'joint-gizmo';
  group.visible = false;
  const meshes = new Map<string, HandleMeshes>();

  // 색×호버 = 최대 6개로 캐시 — 핸들 개수가 늘어도 머티리얼은 늘지 않는다.
  const materials = new Map<string, THREE.MeshBasicNodeMaterial>();
  function materialFor(axisKey: AxisKey, hovered: boolean): THREE.MeshBasicNodeMaterial {
    const key = `${axisKey}-${hovered}`;
    let m = materials.get(key);
    if (!m) {
      const gain = EXPOSURE_GAIN * (hovered ? HOVER_GLOW_GAIN : 1);
      m = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color(AXIS_COLOR[axisKey]).multiplyScalar(gain),
        transparent: true,
        opacity: hovered ? OPACITY_HOVER : OPACITY_NORMAL,
        depthTest: false, // 팔 안쪽에 묻히면 집을 수 없다
        depthWrite: false,
      });
      materials.set(key, m);
    }
    return m;
  }

  // 가동범위 호 전용 — 링·트랙·화살촉과는 별도로 저농도 반투명 캐시.
  const arcMaterials = new Map<AxisKey, THREE.MeshBasicNodeMaterial>();
  function arcMaterialFor(axisKey: AxisKey): THREE.MeshBasicNodeMaterial {
    let m = arcMaterials.get(axisKey);
    if (!m) {
      m = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color(AXIS_COLOR[axisKey]).multiplyScalar(EXPOSURE_GAIN),
        transparent: true,
        opacity: ARC_OPACITY,
        depthTest: false,
        depthWrite: false,
      });
      arcMaterials.set(axisKey, m);
    }
    return m;
  }

  // 현재값 라벨(예: "32°") — 관절 하나당이 아니라 공유 1개(동시에 하나만 드래그된다).
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 160;
  labelCanvas.height = 64;
  const labelCtx = labelCanvas.getContext('2d')!;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  labelMaterial.color = new THREE.Color(0xffffff).multiplyScalar(EXPOSURE_GAIN);
  const labelSprite = new THREE.Sprite(labelMaterial);
  labelSprite.renderOrder = 4;
  labelSprite.visible = false;
  labelSprite.scale.set(0.09, 0.036, 1);
  group.add(labelSprite);

  function drawLabel(text: string): void {
    const w = labelCanvas.width;
    const h = labelCanvas.height;
    labelCtx.clearRect(0, 0, w, h);
    labelCtx.font = 'bold 34px system-ui, sans-serif';
    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'middle';
    labelCtx.lineWidth = 6;
    labelCtx.strokeStyle = 'rgba(0,0,0,0.9)'; // 어떤 배경에서도 읽히도록 외곽선
    labelCtx.strokeText(text, w / 2, h / 2);
    labelCtx.fillStyle = '#ffffff';
    labelCtx.fillText(text, w / 2, h / 2);
    labelTexture.needsUpdate = true;
  }

  let hoveredId: string | null = null;
  let activeDragId: string | null = null;
  let arcMesh: THREE.Mesh | null = null;

  function hideArc(): void {
    if (!arcMesh) return;
    group.remove(arcMesh);
    arcMesh.geometry.dispose();
    arcMesh = null;
  }

  /** 가동범위 호 — revolute만(prismatic은 고정 트랙 자체가 범위를 보여준다). */
  function showArc(h: JointHandle, axisKey: AxisKey): void {
    hideArc();
    if (h.kind === 'prismatic') return;
    const thetaLength = ((h.max - h.min) * Math.PI) / 180;
    // theta=0 기준 방향은 orient()의 setFromUnitVectors가 축마다 결정론적으로 고르는
    // 임의 회전에 종속된다 — 호는 가동범위 "크기"를 보여주는 지표일 뿐 절대 방향을
    // 맞출 필요가 없다.
    const geo = new THREE.RingGeometry(
      RING_RADIUS_M - ARC_WIDTH_M,
      RING_RADIUS_M + ARC_WIDTH_M,
      32,
      1,
      0,
      thetaLength,
    ).rotateX(Math.PI / 2);
    arcMesh = new THREE.Mesh(geo, arcMaterialFor(axisKey));
    arcMesh.renderOrder = 3;
    orient(arcMesh, h);
    group.add(arcMesh);
  }

  function updateDragVisuals(handles: JointHandle[], activeJointId?: string | null): void {
    if (activeJointId === undefined) return; // 생략 — 드래그 상태 불변(상시 sync용)
    if (activeJointId === null) {
      hideArc();
      labelSprite.visible = false;
      activeDragId = null;
      return;
    }
    const h = handles.find((x) => x.id === activeJointId);
    if (!h) return;
    if (activeDragId !== activeJointId) {
      const rec = meshes.get(activeJointId);
      showArc(h, rec?.axisKey ?? dominantAxis(h.localAxis));
    }
    activeDragId = activeJointId;
    const unit = h.kind === 'prismatic' ? 'mm' : '°';
    drawLabel(`${Math.round(h.value)}${unit}`);
    labelSprite.position.set(h.point[0], h.point[1] + LABEL_LIFT_M, h.point[2]);
    labelSprite.visible = true;
  }

  function buildRingRecord(h: JointHandle, axisKey: AxisKey): HandleMeshes {
    const normalGeo = new THREE.TorusGeometry(RING_RADIUS_M, RING_TUBE_M, 8, 40).rotateX(
      Math.PI / 2,
    );
    const hoverGeo = new THREE.TorusGeometry(
      RING_RADIUS_M,
      RING_TUBE_M * HOVER_SCALE,
      8,
      40,
    ).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(normalGeo, materialFor(axisKey, false));
    mesh.name = `gizmo-${h.id}`;
    mesh.renderOrder = 3; // 아웃라인(2) 위
    mesh.userData.jointId = h.id;
    orient(mesh, h);
    group.add(mesh);
    return {
      kind: h.kind,
      axisKey,
      primary: mesh,
      primaryNormalGeo: normalGeo,
      primaryHoverGeo: hoverGeo,
    };
  }

  function buildPrismaticRecord(h: JointHandle, axisKey: AxisKey): HandleMeshes {
    const arrowNormalGeo = new THREE.ConeGeometry(ARROW_RADIUS_M, ARROW_HEIGHT_M, 8);
    const arrowHoverGeo = new THREE.ConeGeometry(
      ARROW_RADIUS_M * HOVER_SCALE,
      ARROW_HEIGHT_M * HOVER_SCALE,
      8,
    );
    const arrow = new THREE.Mesh(arrowNormalGeo, materialFor(axisKey, false));
    arrow.name = `gizmo-${h.id}`;
    arrow.renderOrder = 3;
    arrow.userData.jointId = h.id;
    orient(arrow, h); // 콘의 로컬 +Y = 축 방향이라 뾰족한 끝이 값 증가 방향을 가리킨다
    group.add(arrow);

    const len = trackLengthM(h);
    const trackNormalGeo = new THREE.CylinderGeometry(TRACK_RADIUS_M, TRACK_RADIUS_M, len, 8);
    const trackHoverGeo = new THREE.CylinderGeometry(
      TRACK_RADIUS_M * HOVER_SCALE,
      TRACK_RADIUS_M * HOVER_SCALE,
      len,
      8,
    );
    const track = new THREE.Mesh(trackNormalGeo, materialFor(axisKey, false));
    track.name = `gizmo-track-${h.id}`;
    track.renderOrder = 3;
    track.userData.jointId = h.id; // 트랙을 잡아도 같은 관절을 집는다
    const { point, axis } = trackWorldCenter(h);
    orientAt(track, point, axis);
    group.add(track);

    return {
      kind: h.kind,
      axisKey,
      primary: arrow,
      primaryNormalGeo: arrowNormalGeo,
      primaryHoverGeo: arrowHoverGeo,
      track,
      trackNormalGeo,
      trackHoverGeo,
    };
  }

  function clear(): void {
    for (const rec of meshes.values()) {
      group.remove(rec.primary);
      rec.primaryNormalGeo.dispose();
      rec.primaryHoverGeo.dispose();
      if (rec.track) {
        group.remove(rec.track);
        rec.trackNormalGeo!.dispose();
        rec.trackHoverGeo!.dispose();
      }
    }
    meshes.clear();
    hideArc();
    labelSprite.visible = false;
    activeDragId = null;
    hoveredId = null;
  }

  function show(handles: JointHandle[]): void {
    clear();
    for (const h of handles) {
      const axisKey = dominantAxis(h.localAxis); // 로컬 축 — 부모 체인 회전에 안 흔들린다
      const rec =
        h.kind === 'prismatic' ? buildPrismaticRecord(h, axisKey) : buildRingRecord(h, axisKey);
      meshes.set(h.id, rec);
    }
    group.visible = handles.length > 0;
  }

  function sync(handles: JointHandle[], activeJointId?: string | null): void {
    for (const h of handles) {
      const rec = meshes.get(h.id);
      if (!rec) continue;
      orient(rec.primary, h); // 링(회전) 또는 화살촉(직선, 현재 값 위치)
      if (rec.track) {
        const { point, axis } = trackWorldCenter(h); // 고정 = 값 독립이지 월드 고정이 아니다
        orientAt(rec.track, point, axis);
      }
    }
    updateDragVisuals(handles, activeJointId);
  }

  function hide(): void {
    clear();
    group.visible = false;
  }

  function pick(raycaster: THREE.Raycaster): string | null {
    if (!group.visible) return null;
    const targets: THREE.Mesh[] = [];
    for (const rec of meshes.values()) {
      targets.push(rec.primary);
      if (rec.track) targets.push(rec.track);
    }
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length > 0 ? (hits[0].object.userData.jointId as string) : null;
  }

  function applyHoverState(id: string, hovered: boolean): void {
    const rec = meshes.get(id);
    if (!rec) return;
    rec.primary.material = materialFor(rec.axisKey, hovered);
    rec.primary.geometry = hovered ? rec.primaryHoverGeo : rec.primaryNormalGeo;
    if (rec.track) {
      rec.track.material = materialFor(rec.axisKey, hovered);
      rec.track.geometry = hovered ? rec.trackHoverGeo! : rec.trackNormalGeo!;
    }
  }

  function setHovered(jointId: string | null): void {
    if (jointId === hoveredId) return;
    if (hoveredId) applyHoverState(hoveredId, false);
    hoveredId = jointId;
    if (hoveredId) applyHoverState(hoveredId, true);
  }

  function dispose(): void {
    hide();
    for (const m of materials.values()) m.dispose();
    materials.clear();
    for (const m of arcMaterials.values()) m.dispose();
    arcMaterials.clear();
    labelTexture.dispose();
    labelMaterial.dispose();
    group.remove(labelSprite);
  }

  return { group, show, hide, sync, pick, setHovered, dispose };
}
