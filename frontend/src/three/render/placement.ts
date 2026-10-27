// 라이브러리 드래그→포인터→책상면 레이캐스트→스냅→충돌 판정 흐름, main의 window.__sim이 쓰는 테스트 훅 노출
import * as THREE from 'three/webgpu';
import type {
  JointHandle,
  MountEvent,
  PlacedItem,
  RotateHandle,
  SimScene,
  WallHit,
  PegboardHit,
  MonitorTopHit,
} from '../scene/scene';
import { getProduct, type ProductSpec } from '../scene/product';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  rayPlaneHit,
  rayAxisClosestMm,
  angleAroundAxisDeg,
  sub,
  type DragRay,
  type Vec3,
} from '../core/gizmoMath';
import {
  baseSupportY,
  canRestOnMonitor,
  isFloorMounted,
  isPegboardMounted,
  isWallMounted,
} from '../core/snap';
import { mmToM } from '../core/units';
import { snapYawDeg, yawFromRingOffset } from '../core/rotateSnap';

/** 배치 아이템의 순간 포즈 — 되돌리기(undo) 스냅샷 단위. */
export interface ItemPose {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
}

/** 드래그로 아이템을 옮기고 손을 뗐을 때(실제로 움직인 경우만) 한 번 발행 — 되돌리기 버튼 배선용. */
export interface MoveCommittedEvent {
  id: string;
  from: ItemPose;
}

export interface Placement {
  placeProduct: (id: string) => { id: string; collided: boolean } | null;
  placeProductAt: (id: string, x: number, z: number) => { id: string; collided: boolean } | null;
  attachLibraryDrag: (el: HTMLElement, specId: string) => void;
  placedCount: () => number;
  onChange: (cb: (s: { count: number; collided: boolean; boundary: boolean }) => void) => void;
  /** GLB를 못 받아 드롭이 취소됐을 때 (사용자에게 알릴 책임은 구독자에게 있다). */
  onPlaceError: (cb: (spec: ProductSpec) => void) => void;
  /** 드롭한 제품의 GLB를 처음 내려받는 동안 true — HUD가 로딩 표시를 띄운다. */
  onAssetLoading: (cb: (loading: boolean) => void) => void;
  /** canvas click on a placed item (null = clicked empty space) */
  onSelect: (cb: (item: PlacedItem | null) => void) => void;
  /** canvas hover over a placed item (null = hovering empty space / suppressed
   *  while dragging or pressing). rAF-throttled. Drives the D17 hover outline. */
  onHover: (cb: (item: PlacedItem | null) => void) => void;
  /** 스토어가 선택을 바꿀 때 알려준다 — gizmo 히트 판정 대상. */
  setSelected: (placedId: string | null) => void;
  /** 편집 잠금 토글 — 켜지면 캔버스 픽·드래그·라이브러리 드롭이 전부 막히고 오빗만 남는다. */
  setEditLocked: (locked: boolean) => void;
  /** gizmo 드래그로 관절 값이 바뀔 때 (슬라이더 패널 갱신용). */
  onJointChange: (cb: (itemId: string, jointId: string) => void) => void;
  /** 링 드래그로 yaw가 바뀔 때 (선택 패널의 각도 표시 갱신용) — 관절과 같은 규약. */
  onRotateChange: (cb: (itemId: string, yawDeg: number) => void) => void;
  /**
   * R 키 회전 (REQ-SIM-18) — **진행 중인 드래그 제스처**에 델타를 먹인다. 라이브러리
   * 드래그면 고스트, 배치 아이템 드래그면 그 아이템이다. 돌릴 제스처가 없으면 null이고,
   * 그때 호출부(스토어)가 선택 아이템 회전으로 넘어간다. 고스트는 배치 id가 없으므로
   * `id`가 null이다.
   */
  rotateDragged: (deltaDeg: number) => { id: string | null; yawDeg: number } | null;
  /** 결합·엣지 스냅 알림 (엔진이 정본, 여긴 전달만) — 배지·배너 배선용. */
  onMountEvent: (cb: (e: MountEvent) => void) => void;
  /** 아이템 드래그 이동이 끝났을 때 (놓기 전 시작 포즈 스냅샷) — 되돌리기 버튼 배선용. */
  onMoveCommitted: (cb: (e: MoveCommittedEvent) => void) => void;
  /** 라이브러리 드래그로 새 아이템이 실제로 놓였을 때(Ctrl+Z 되돌리기 스택 배선용,
   *  2026-08-06) — 클릭 배치(`placeProduct`/`placeProductAt`, e2e 훅 전용)와 복제·붙여넣기는
   *  각자 자리에서 직접 스택에 쌓으므로 여기서 다시 안 낸다. */
  onItemAdded: (cb: (id: string) => void) => void;
}

/** Default slot (desk-space metres) — repeated placement here overlaps -> collision. */
const DEFAULT_SLOT = { x: 0, z: 0.06 };

/** 바닥 제품(의자 등)의 클릭 배치 기본 자리에서 책상 앞변과 아이템 사이에 두는 여유 (m).
 *  DEFAULT_SLOT을 그대로 쓰면 바닥 제품이 책상 한가운데(밑)에 놓여 의자가 상판을 뚫고
 *  앉은 모양이 된다 — 책상 앞으로 빼서 마주 보게 놓는다(2026-08-06 사용자 요청). */
const FLOOR_SLOT_CLEARANCE_M = 0.15;

/** 자석 결합 발동 거리 (m) — 드래그 중인 모니터 중심과 암 결합 앵커의 XZ 거리. */
const MAGNET_RADIUS_M = 0.15;

/** 드래그 재분리 거리 (m) — 붙은 뒤 포인터가 앵커에서 이만큼 멀어지면 되뗀다.
 *  부착 150 < 분리 200의 히스테리시스 밴드가 경계에서의 붙었다 떨어졌다(플래핑)를 막는다.
 *  같은 값이면 경계에 걸친 한 픽셀 떨림마다 결합·분리 이벤트가 번갈아 터진다. */
const MAGNET_DETACH_RADIUS_M = 0.2;

export function createPlacement(
  sim: SimScene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGPURenderer,
  controls: OrbitControls,
): Placement {
  const canvas = renderer.domElement as HTMLCanvasElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const changeCbs: ((s: { count: number; collided: boolean; boundary: boolean }) => void)[] = [];
  /** 현재 선택 아이템 — gizmo 히트 판정은 선택된 아이템에만 적용된다. */
  let selectedId: string | null = null;
  /** 편집 잠금(2026-07-27) — 켜지면 캔버스 누름이 전부 오빗으로만 떨어진다(아이템/관절
   *  픽·드래그 게이트가 pointerdown 최상단이라 선택도 함께 막힌다 — "보기 전용" 의도). */
  let editLocked = false;
  const jointCbs: ((itemId: string, jointId: string) => void)[] = [];
  const rotateCbs: ((itemId: string, yawDeg: number) => void)[] = [];
  const moveCommittedCbs: ((e: MoveCommittedEvent) => void)[] = [];
  const itemAddedCbs: ((id: string) => void)[] = [];

  // --- 단일 제스처 상태머신 ---
  // 리스너를 쌍쌍이 늘리면(라이브러리 드래그 / 아이템 이동 / 오빗 / 픽) 서로의
  // 상태를 보고 판단해야 해서 조합이 터진다. 포인터 하나 = 제스처 하나로 고정.
  let placeErrorCb: ((spec: ProductSpec) => void) | null = null;

  // GLB 첫 로드 대기 표시 (dropSpec) — 동시 드롭이 겹칠 수 있어 boolean이 아니라 카운터다.
  let assetLoadingCb: ((loading: boolean) => void) | null = null;
  let assetLoadingCount = 0;

  type Gesture =
    | { kind: 'library'; specId: string; startX: number; startY: number; moved: boolean }
    | {
        kind: 'item';
        id: string;
        startX: number;
        startY: number;
        moved: boolean;
        /** 이 제스처 도중 자석으로 붙은 암 (D22 개정) — 놓기 전이면 끌어서 되뗄 수 있다. */
        mountedArmId?: string;
        /** 드래그 시작 시점의 포즈 — 되돌리기(undo) 1단계 복원용 스냅샷. */
        fromPose: ItemPose;
      }
    | { kind: 'orbit'; startX: number; startY: number; moved: boolean }
    | {
        kind: 'rotate';
        itemId: string;
        /** 링을 잡은 순간의 yaw(도)와 그 지점의 링 각도 — 델타로 회전시켜야 안 튄다. */
        startYawDeg: number;
        refAngleDeg: number;
        startX: number;
        startY: number;
        moved: boolean;
      }
    | {
        kind: 'joint';
        itemId: string;
        jointId: string;
        startValue: number;
        /** revolute: 드래그 시작 시 관절 평면 위 기준 벡터. prismatic: 시작 mm. */
        ref: Vec3 | number;
        startX: number;
        startY: number;
        moved: boolean;
      };
  let gesture: Gesture | null = null;

  const DRAG_THRESHOLD_PX = 6;

  function markMoved(e: PointerEvent): boolean {
    if (!gesture) return false;
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > DRAG_THRESHOLD_PX) {
      gesture.moved = true;
    }
    return gesture.moved;
  }

  // --- 자석 결합 (REQ-SIM-22, D22) ---
  // 드래그 중인 모니터가 암 결합 앵커에 들어오면 판정 ②를 즉시 실행한다. FIT·
  // CONDITIONAL이면 드롭을 기다리지 않고 그 자리에서 붙고(자석), INCOMPATIBLE이면
  // 사유만 낸다. 한 제스처에서 같은 암에는 한 번만 시도해 거절 배너가 도배되지 않게 한다.
  // 붙어도 제스처는 끝나지 않는다 — 놓기 전이면 끌어서 되뗄 수 있고, 결합 확정은
  // 릴리스 시점이다 (D22 2026-07-26 개정).
  let magnetArmId: string | null = null;

  // --- 라이브러리 드래그 중 고스트 회전 (R 키, ADR-0022 결정 7) ---
  // 고스트 자체는 엔진(scene)이 소유하지만 **yaw의 정본은 여기**다: 고스트를 매
  // pointermove마다 `ghostShow`로 다시 그리므로 각도를 이쪽에서 들고 있지 않으면
  // 커서를 움직이는 순간 0으로 되돌아간다. 드롭 시 `placeAt(opts.yawDeg)`로 넘어간다.
  let ghostYawDeg = 0;
  /** 마지막 고스트 프리뷰 지점 (상판 m) — R 키가 커서를 안 움직이고 프리뷰를 다시 그린다. */
  let ghostPt: { x: number; z: number } | null = null;
  /** 고스트가 지금 모니터 위에 얹혀 있으면 그 히트 (DERO-591) — 이게 없으면 R 키
   *  프리뷰가 `ghostPt`(상판 좌표)로 다시 그려져 고스트만 상판으로 떨어진다. */
  let ghostMonitorHit: MonitorTopHit | null = null;

  /** 결합 앵커와 포인터 표면 좌표의 XZ 거리 (m). 앵커를 못 찾으면 Infinity. */
  function anchorDistance(armId: string, x: number, z: number): number {
    const m = sim.mountPoints().find((p) => p.armId === armId);
    return m ? Math.hypot(m.point[0] - x, m.point[2] - z) : Infinity;
  }

  function nearestArm(x: number, z: number): string | null {
    let best: string | null = null;
    let bestD = MAGNET_RADIUS_M;
    for (const m of sim.mountPoints()) {
      const d = Math.hypot(m.point[0] - x, m.point[2] - z);
      if (d <= bestD) {
        bestD = d;
        best = m.armId;
      }
    }
    return best;
  }

  /** 반환 true = 결합돼서 이 제스처를 여기서 끝내야 한다. */
  function tryMagnet(monitorId: string): boolean {
    const it = sim.placed().find((i) => i.id === monitorId);
    if (!it?.spec.monitor || it.mountedToId) return false;
    const armId = nearestArm(it.center.x, it.center.z);
    if (!armId) {
      magnetArmId = null; // 멀어졌다 다시 다가오면 사유를 다시 낸다
      return false;
    }
    if (armId === magnetArmId) return false;
    magnetArmId = armId;
    return sim.tryMountMonitor(monitorId, armId)?.mounted ?? false;
  }

  function fireChange(): void {
    const s = {
      count: sim.placed().length,
      collided: sim.anyCollision(),
      boundary: sim.anyBoundaryViolation(),
    };
    for (const cb of changeCbs) cb(s);
  }

  function fireItemAdded(id: string): void {
    for (const cb of itemAddedCbs) cb(id);
  }

  /** 클릭 배치(드래그 없이 놓기)의 기본 자리 — 상판 제품은 책상 중앙 부근(DEFAULT_SLOT),
   *  바닥 제품은 책상 앞변에서 여유를 두고 앞으로 뺀 자리다. z는 아이템의 가장 가까운
   *  면이 책상 앞변에서 FLOOR_SLOT_CLEARANCE_M만큼 떨어지도록 깊이 절반을 더해 잡는다. */
  function defaultSlotFor(spec: ProductSpec): { x: number; z: number } {
    if (!isFloorMounted(spec)) return DEFAULT_SLOT;
    const si = sim.surfaceInfo();
    return { x: 0, z: si.halfD + mmToM(spec.depthMm) / 2 + FLOOR_SLOT_CLEARANCE_M };
  }

  /** 지금 옮기는 중인 제품 규격 — 오빗·관절 제스처면 null. */
  function draggedSpec(g: Gesture): ProductSpec | null {
    if (g.kind === 'library') return getProduct(g.specId) ?? null;
    if (g.kind === 'item') return sim.placed().find((i) => i.id === g.id)?.spec ?? null;
    return null;
  }

  /** 드래그 좌표를 잡는 수평면의 y (m) — 아이템이 **실제로 놓일 높이**여야 한다.
   *  바닥 제품(FLOOR)을 상판 평면으로 잡으면 커서와 실제 배치 자리가 어긋난다. */
  function dragPlaneY(spec: ProductSpec | null): number {
    const topY = sim.surfaceInfo().topY;
    return spec ? baseSupportY(spec, topY) : topY;
  }

  function raycastToSurface(
    clientX: number,
    clientY: number,
    planeY: number,
  ): { x: number; z: number } | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  /** 포인터가 가리키는 벽면 위의 점 (REQ-SIM-02) — 켜진 벽만 본다(필터는 엔진 몫).
   *  수평면 레이캐스트(`raycastToSurface`)와 달리 y를 낸다: 벽 아이템의 높이는
   *  파생값이 아니라 사용자가 포인터로 정하는 값이다. */
  function pickWallAt(clientX: number, clientY: number): WallHit | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return sim.pickWall(raycaster);
  }

  /** 포인터가 가리키는 부착 호스트(타공판 패널 또는 그 위에 붙은 후크) 위의 점. */
  function pickPegboardAt(
    clientX: number,
    clientY: number,
    /** 끌고 있는 아이템 — 자기 자신·자손을 호스트 후보에서 뺀다(안 빼면 이동이 얼어붙는다). */
    excludeId?: string,
  ): PegboardHit | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return sim.pickPegboard(raycaster, excludeId);
  }

  /** 포인터가 가리키는 모니터 패널 위의 점 (DERO-591) — 상판 평면 레이캐스트보다
   *  먼저 본다. 같은 XZ에 상판과 패널 두 타깃이 있고 의도를 가르는 것은 커서 레이뿐이다. */
  function pickMonitorTopAt(
    clientX: number,
    clientY: number,
    /** 끌고 있는 아이템 — 자기 자신은 호스트가 될 수 없다. */
    excludeId?: string,
  ): MonitorTopHit | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return sim.pickMonitorTop(raycaster, excludeId);
  }

  /** 타공판 제품 드롭 — 짚은 호스트에 붙인다. 아무것도 안 짚었으면 좌표 없이 배치해
   *  엔진이 켜져 있는 패널 중앙에 붙인다(패널조차 없으면 상판으로 물러선다). */
  function placeOnPegboard(
    spec: ProductSpec,
    clientX: number,
    clientY: number,
    moved: boolean,
  ): { id: string; collided: boolean } {
    const hit = moved ? pickPegboardAt(clientX, clientY) : null;
    return sim.placeAt(
      spec,
      hit ? hit.x : DEFAULT_SLOT.x,
      hit ? hit.z : DEFAULT_SLOT.z,
      hit ? { pegboard: hit } : undefined,
    );
  }

  /** 벽 제품 드롭 — 놓은 자리의 벽에 붙인다. 벽을 안 짚었으면(짧은 클릭이거나 천장
   *  방향으로 놓았으면) 좌표 없이 배치해 엔진이 켜진 벽 중 하나에 상판 높이로 붙인다. */
  function placeOnWall(
    spec: ProductSpec,
    clientX: number,
    clientY: number,
    moved: boolean,
  ): { id: string; collided: boolean } {
    const hit = moved ? pickWallAt(clientX, clientY) : null;
    return sim.placeAt(
      spec,
      hit ? hit.x : DEFAULT_SLOT.x,
      hit ? hit.z : DEFAULT_SLOT.z,
      hit ? { wall: { side: hit.side, centerY: hit.y } } : undefined,
    );
  }

  /** 포인터 NDC -> 월드 광선 (gizmoMath가 먹는 순수 배열 형식). */
  function pointerRay(clientX: number, clientY: number): DragRay {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    return { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] };
  }

  function pickJoint(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return sim.jointGizmo.pick(raycaster);
  }

  function pickRotateRing(clientX: number, clientY: number): boolean {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return sim.rotateGizmo.pick(raycaster);
  }

  /** 포인터가 링 평면(수평, 링 y)을 맞힌 지점의 각도(도). 평면을 못 맞히면 null. */
  function ringAngleDeg(ray: DragRay, h: RotateHandle): number | null {
    const hit = rayPlaneHit(ray, h.center, [0, 1, 0]);
    return hit ? yawFromRingOffset(hit[0] - h.center[0], hit[2] - h.center[2]) : null;
  }

  /** 관절 평면 위 교점에서 피벗점을 뺀 기준 벡터 (회전 각도의 0점). */
  function refVectorOnJointPlane(ray: DragRay, h: JointHandle): Vec3 | null {
    const hit = rayPlaneHit(ray, h.point, h.axis);
    return hit ? sub(hit, h.point) : null;
  }

  // 프로그램 배치 경로(테스트 훅·프리셋)는 착지 트윈을 쓰지 않는다 — 호출 직후
  // 좌표를 읽는 쪽이 트윈 중간값을 보면 안 된다. 트윈은 실제 드롭·복제 전용.
  function placeProduct(id: string): { id: string; collided: boolean } | null {
    const spec = getProduct(id);
    if (!spec || spec.kind === 'surface') return null;
    const slot = defaultSlotFor(spec);
    const res = sim.placeAt(spec, slot.x, slot.z);
    fireChange();
    return res;
  }

  function placeProductAt(
    id: string,
    x: number,
    z: number,
  ): { id: string; collided: boolean } | null {
    const spec = getProduct(id);
    if (!spec || spec.kind === 'surface') return null;
    const res = sim.placeAt(spec, x, z);
    fireChange();
    return res;
  }

  window.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    if (!markMoved(e)) return;
    if (gesture.kind === 'rotate') {
      const g = gesture;
      const h = sim.rotateHandle(g.itemId);
      if (!h) return;
      const angle = ringAngleDeg(pointerRay(e.clientX, e.clientY), h);
      if (angle === null) return;
      // 잡은 지점과의 **델타**를 시작 yaw에 더한다 — 링의 아무 데나 집어도 그 순간
      // 아이템이 커서 방향으로 튀지 않는다. 45° 배수 근처면 자석이 문다.
      const applied = sim.rotateItem(g.itemId, snapYawDeg(g.startYawDeg + (angle - g.refAngleDeg)));
      if (applied === null) return;
      // 회전하면 요람 안착이 다시 풀려 아이템 밑면 높이·중심이 움직인다 — 링도 따라간다.
      sim.rotateGizmo.sync(sim.rotateHandle(g.itemId), applied);
      fireChange();
      for (const cb of rotateCbs) cb(g.itemId, applied);
      return;
    }
    if (gesture.kind === 'joint') {
      const g = gesture;
      const h = sim.jointHandles(g.itemId).find((x) => x.id === g.jointId);
      if (!h) return;
      const ray = pointerRay(e.clientX, e.clientY);
      let value: number | null = null;
      if (h.kind === 'prismatic') {
        const mm = rayAxisClosestMm(ray, h.point, h.axis);
        if (mm !== null) value = g.startValue + (mm - (g.ref as number));
      } else {
        const cur = refVectorOnJointPlane(ray, h);
        if (cur) value = g.startValue + angleAroundAxisDeg(g.ref as Vec3, cur, h.axis);
      }
      if (value === null) return;
      sim.articulate(g.itemId, g.jointId, value);
      // 드래그 중인 관절 id를 같이 넘겨 가동범위 호·현재값 라벨을 띄운다.
      sim.jointGizmo.sync(sim.jointHandles(g.itemId), g.jointId);
      fireChange();
      for (const cb of jointCbs) cb(g.itemId, g.jointId);
      return;
    }
    const spec = draggedSpec(gesture);
    // 벽 제품은 수평면이 아니라 **벽 메쉬**에 레이를 쏜다 — 붙을 자리가 평면 수식이
    // 아니라 씬에 실제로 있는 벽이다. 어느 벽에도 안 닿으면(천장 방향 등) 아무것도
    // 움직이지 않는다: 마지막 유효 위치를 유지해야지 상판으로 튀면 안 된다.
    if (spec && isWallMounted(spec)) {
      const hit = pickWallAt(e.clientX, e.clientY);
      if (!hit) return;
      if (gesture.kind === 'item') {
        sim.moveItemOnWall(gesture.id, hit.side, hit);
        fireChange();
      } else {
        sim.ghostShowOnWall(spec, hit.side, hit);
      }
      return;
    }
    // 타공판 제품은 벽 메쉬가 아니라 **부착 호스트 아이템**에 레이를 쏜다 — 판을 짚으면
    // 판에 붙고, 이미 붙어 있는 후크를 짚으면 거기 걸린다. 아무것도 안 닿으면 벽 제품과
    // 같은 규약으로 마지막 유효 자세를 유지한다(상판으로 튀면 안 된다).
    if (spec && isPegboardMounted(spec)) {
      const hit = pickPegboardAt(
        e.clientX,
        e.clientY,
        gesture.kind === 'item' ? gesture.id : undefined,
      );
      if (!hit) return;
      if (gesture.kind === 'item') {
        sim.moveItemOnPegboard(gesture.id, hit);
        fireChange();
      } else {
        sim.ghostShowOnPegboard(spec, hit);
      }
      return;
    }
    // 모니터 위 얹기 (DERO-591) — 커서가 패널을 맞히면 드롭 높이가 패널 상단이다.
    // 상판 평면보다 먼저 본다. 안 맞히면 아래 상판 경로로 그대로 흘러간다(무회귀: 빈 공간·
    // 목 옆은 레이가 패널을 못 맞히므로 종전 높이 그대로다).
    if (spec && canRestOnMonitor(spec)) {
      const top = pickMonitorTopAt(
        e.clientX,
        e.clientY,
        gesture.kind === 'item' ? gesture.id : undefined,
      );
      if (top && gesture.kind !== 'item') {
        ghostMonitorHit = top;
        sim.ghostShowOnMonitorTop(spec, top, ghostYawDeg);
        return;
      }
      // 엔진이 거부하면(결합 중인 모니터 등) 종전 상판 경로로 흘려보낸다 — 여기서 삼키면
      // 커서가 모니터 위를 지나는 동안 아이템이 아예 안 따라온다(자석 재분리도 못 탄다).
      if (top && gesture.kind === 'item' && sim.moveItemOnMonitorTop(gesture.id, top)) {
        fireChange();
        return;
      }
      ghostMonitorHit = null;
    }
    const pt = raycastToSurface(e.clientX, e.clientY, dragPlaneY(spec));
    if (!pt) return;
    if (gesture.kind === 'library') {
      // 고스트가 커서를 따라다니며 "여기 놓인다"를 미리 보여준다 (스냅 링 포함).
      const spec = getProduct(gesture.specId);
      // R 키로 돌려둔 yaw를 매번 같이 넘긴다 — 안 넘기면 커서를 움직이는 순간 0으로 돌아간다.
      if (spec && spec.kind !== 'surface') {
        ghostPt = pt;
        sim.ghostShow(spec, pt.x, pt.z, ghostYawDeg);
      }
    } else if (gesture.kind === 'item') {
      const g = gesture;
      if (g.mountedArmId) {
        // 결합 중 — moveItem은 막혀 있으므로(mountedToId 가드) 아이템 중심이 아니라
        // **포인터가 가리키는 상판 좌표**로 거리를 잰다. 밴드를 벗어나면 되뗀다.
        if (anchorDistance(g.mountedArmId, pt.x, pt.z) > MAGNET_DETACH_RADIUS_M) {
          sim.detachMonitor(g.id, { at: pt });
          g.mountedArmId = undefined;
          magnetArmId = null; // 스로틀 해제 — 다시 다가오면 재판정·재결합한다
          fireChange();
        }
        return;
      }
      sim.moveItem(g.id, pt.x, pt.z);
      if (tryMagnet(g.id) && magnetArmId) {
        // 착 붙되 제스처는 살아 있다 — 확정은 pointerup, 그전엔 끌어서 되뗄 수 있다.
        g.mountedArmId = magnetArmId;
      }
      fireChange();
    }
  });

  /**
   * 라이브러리 드롭의 꼬리. GLB는 여기서 처음 로드될 수 있어 async다 — placeAt 자체는
   * 여전히 동기이고, 템플릿이 준비된 **뒤에** 부른다. 로드 실패면 배치를 아예 취소한다:
   * 파라메트릭 자리표시자 상자가 책상에 놓이는 것보다 아무것도 안 놓이는 편이 정직하다.
   */
  async function dropSpec(
    base: ProductSpec,
    /** 상판 드롭 지점 — 벽 거치 제품이면 null이고 `pointer`로 벽을 다시 레이캐스트한다. */
    pt: { x: number; z: number } | null,
    pointer: { clientX: number; clientY: number; moved: boolean },
    /** 드롭 시점의 고스트 yaw(도) — R 키로 돌려둔 각도를 그대로 물려받는다. */
    yawDeg: number,
  ): Promise<void> {
    let spec: ProductSpec;
    // 캐시 미스면 이 await가 수 초 걸린다 — 그동안 아무 표시가 없으면 드롭이 씹힌 것처럼
    // 보인다. 캐시 히트는 다음 마이크로태스크에 풀려 표시가 화면에 닿기 전에 꺼진다
    // (칩 CSS가 0.15s 지연 페이드라 순간 점멸도 없다).
    assetLoadingCount++;
    if (assetLoadingCount === 1) assetLoadingCb?.(true);
    try {
      spec = await sim.ensureTemplate(base);
    } catch (err: unknown) {
      console.error(`[placement] ${base.id} GLB 로드 실패 — 배치 취소`, err);
      placeErrorCb?.(base);
      return;
    } finally {
      assetLoadingCount--;
      if (assetLoadingCount === 0) assetLoadingCb?.(false);
    }
    // 벽 거치는 상판 평면이 아니라 벽면을 맞혀야 한다 — placeOnWall이 자체 레이캐스트를 돈다.
    if (isWallMounted(spec)) {
      const wallRes = placeOnWall(spec, pointer.clientX, pointer.clientY, pointer.moved);
      fireItemAdded(wallRes.id);
      fireChange();
      return;
    }
    // 타공판 부착도 상판 평면이 아니라 호스트 메쉬를 맞혀야 한다 — 같은 이유로 자체
    // 레이캐스트를 돈다.
    if (isPegboardMounted(spec)) {
      const pegRes = placeOnPegboard(spec, pointer.clientX, pointer.clientY, pointer.moved);
      fireItemAdded(pegRes.id);
      fireChange();
      return;
    }
    // 놓는 순간 착지 트윈 — 드롭이 "떨어뜨림"으로 읽히게 한다.
    const slot = pt ?? defaultSlotFor(spec);
    // 손을 뗀 자리가 모니터 패널이면 드롭 높이가 패널 상단이다 (DERO-591) — 좌표도
    // 엔진이 패널 기준으로 다시 잡으므로 slot은 안 맞힌 경우의 값 그대로 넘긴다.
    const monitorTop =
      pointer.moved && canRestOnMonitor(spec)
        ? pickMonitorTopAt(pointer.clientX, pointer.clientY)
        : null;
    const res = sim.placeAt(spec, slot.x, slot.z, {
      drop: true,
      yawDeg,
      monitorTop: monitorTop ?? undefined,
    });
    // 라이브러리에서 곧장 암 위에 떨군 경우도 자석이 받는다 (근접 검사 1회).
    if (spec.monitor) tryMagnet(res.id);
    fireItemAdded(res.id);
    fireChange();
  }

  window.addEventListener('pointerup', (e) => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    controls.enabled = true;
    // 자석 스로틀은 제스처 단위다 — 여기서 안 풀면 다음 드래그가 같은 암에 한 번도
    // 시도하지 못한다(결합 상태로 손을 뗀 경우 특히). 결합 자체는 이 시점에 확정된다.
    magnetArmId = null;

    if (g.kind === 'library') {
      sim.ghostHide();
      // 고스트 각도는 제스처와 함께 끝난다 — 여기서 안 비우면 다음 드래그가 돌아간 채 시작한다.
      const droppedYawDeg = ghostYawDeg;
      ghostYawDeg = 0;
      ghostPt = null;
      ghostMonitorHit = null;
      const base = getProduct(g.specId);
      if (!base || base.kind === 'surface') return;
      // 상판 드롭 지점은 await 전에 확정한다 — GLB가 늦게 도착해도 손을 뗀 자리에 놓여야 한다.
      // 드래그 평면 높이는 mountSurface로만 갈리므로 실측 전 spec으로 잡아도 결과가 같다.
      // 벽 거치는 여기서 안 잰다 — dropSpec이 템플릿 확보 후 placeOnWall로 넘긴다.
      const pt =
        g.moved && !isWallMounted(base) && !isPegboardMounted(base)
          ? raycastToSurface(e.clientX, e.clientY, dragPlaneY(base))
          : null;
      void dropSpec(
        base,
        pt,
        { clientX: e.clientX, clientY: e.clientY, moved: g.moved },
        droppedYawDeg,
      );
      return;
    }

    // 링 클릭도 선택 해제로 새면 안 된다 (아래 관절 gizmo와 같은 이유) — 링은 아이템
    // 실루엣 밖에 있어 6px 미만으로 누르면 빈 공간 픽으로 떨어진다.
    if (g.kind === 'rotate') {
      sim.rotateGizmo.sync(sim.rotateHandle(g.itemId), null); // 각도 라벨만 정리(링은 남는다)
      return;
    }

    // gizmo 링 클릭은 선택 해제로 새면 안 된다 — 링은 depthTest:false에 반지름
    // 45mm라 팔 실루엣 밖까지 걸쳐 있고, 그 밖을 6px 미만으로 누르면 빈 공간
    // 픽(pickPlaced -> null)으로 떨어져 방금 누른 gizmo가 사라진다.
    if (g.kind === 'joint') {
      // 드래그 종료 — 가동범위 호·현재값 라벨을 정리한다(핸들 자체는 남는다).
      sim.jointGizmo.sync(sim.jointHandles(g.itemId), null);
      return;
    }

    // 아이템/오빗 제스처: 움직이지 않았으면 픽(선택 또는 선택 해제)
    if (g.moved) {
      // 실제로 옮긴 드래그만 되돌리기 대상 — 자석으로 붙었어도 이벤트는 쏜다
      // (restorePose가 mountedToId 가드로 알아서 거부한다).
      if (g.kind === 'item') {
        for (const cb of moveCommittedCbs) cb({ id: g.id, from: g.fromPose });
      }
      return;
    }
    const item = pickPlaced(e.clientX, e.clientY);
    for (const cb of selectCbs) cb(item);
  });

  // --- click-select / drag-move of placed items ---
  const selectCbs: ((item: PlacedItem | null) => void)[] = [];

  function pickPlaced(clientX: number, clientY: number): PlacedItem | null {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const items = sim.placed();
    const hits = raycaster.intersectObjects(
      items.map((i) => i.group),
      true,
    );
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        const owner = items.find((i) => i.group === o);
        if (owner) return owner;
        o = o.parent;
      }
    }
    return null;
  }

  // 아이템 위에서 시작한 드래그는 이동, 빈 공간에서 시작한 드래그는 오빗.
  // 둘 다 6px 미만이면 픽(선택/선택 해제)으로 끝난다 — 판정은 pointerup에서.
  canvas.addEventListener('pointerdown', (e) => {
    if (gesture) return; // 라이브러리 드래그가 진행 중이면 캔버스 누름은 무시
    if (editLocked) {
      gesture = { kind: 'orbit', startX: e.clientX, startY: e.clientY, moved: false };
      return;
    }
    const jointId = pickJoint(e.clientX, e.clientY);
    if (jointId && selectedId) {
      const h = sim.jointHandles(selectedId).find((x) => x.id === jointId);
      if (h) {
        const ray = pointerRay(e.clientX, e.clientY);
        const ref =
          h.kind === 'prismatic'
            ? (rayAxisClosestMm(ray, h.point, h.axis) ?? 0)
            : refVectorOnJointPlane(ray, h);
        if (ref !== null) {
          gesture = {
            kind: 'joint',
            itemId: selectedId,
            jointId,
            startValue: h.value,
            ref,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
          };
          controls.enabled = false; // 관절을 끄는 동안 카메라가 같이 돌면 안 된다
          return;
        }
      }
    }
    // 기즈모 히트 우선 (ADR-0002): 관절 > 회전 링 > 아이템 > 빈 곳. 링은 아이템
    // footprint 밖 5cm에 있어 아이템 픽과 겹치지 않지만, 관절 링과는 겹칠 수 있어
    // 관절이 먼저다(관절은 선택 아이템 위에만 뜨고 조작 정밀도가 더 높다).
    if (selectedId && pickRotateRing(e.clientX, e.clientY)) {
      const h = sim.rotateHandle(selectedId);
      const ref = h ? ringAngleDeg(pointerRay(e.clientX, e.clientY), h) : null;
      if (h && ref !== null) {
        gesture = {
          kind: 'rotate',
          itemId: selectedId,
          startYawDeg: h.yawDeg,
          refAngleDeg: ref,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        };
        controls.enabled = false; // 링을 돌리는 동안 카메라가 같이 돌면 안 된다
        return;
      }
    }
    const hit = pickPlaced(e.clientX, e.clientY);
    if (hit) {
      magnetArmId = null; // 자석 스로틀은 제스처 단위다
      gesture = {
        kind: 'item',
        id: hit.id,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        fromPose: { x: hit.center.x, y: hit.center.y, z: hit.center.z, yawDeg: hit.yawDeg },
      };
      controls.enabled = false; // 아이템을 끄는 동안 카메라가 같이 돌면 안 된다
    } else {
      gesture = { kind: 'orbit', startX: e.clientX, startY: e.clientY, moved: false };
    }
  });

  // --- hover of placed items (D17 outline feedback) ---
  // rAF-throttled: pointermove only stashes coords; at most one raycast per frame.
  // Suppressed while a library drag or an orbit press is active (no distracting
  // rim while manipulating). Emits only on change so callers can no-op.
  const hoverCbs: ((item: PlacedItem | null) => void)[] = [];
  let hoverPending: { x: number; y: number } | null = null;
  let hoverRaf = 0;
  let lastHover: PlacedItem | null = null;

  function runHover(): void {
    hoverRaf = 0;
    const pt = hoverPending;
    hoverPending = null;
    if (!pt) return;
    // gizmo 핸들이 선택 아이템 위에 떠 있으면 그걸 먼저 히트 판정한다 — 걸리면
    // 아이템 hover(D17 아웃라인)는 억제해 gizmo 강조와 안 겹치게 한다. 다른
    // 제스처가 진행 중이면(드래그·오빗 등) 기존처럼 hover 전체를 쉰다.
    const jointId = !gesture && selectedId ? pickJoint(pt.x, pt.y) : null;
    sim.jointGizmo.setHovered(jointId);
    // 회전 링도 같은 규약 — 관절이 안 걸렸을 때만 보고(픽 우선순위와 같은 순서),
    // 링에 걸리면 아이템 아웃라인을 억제한다.
    const ringHovered = !gesture && !jointId && !!selectedId && pickRotateRing(pt.x, pt.y);
    sim.rotateGizmo.setHovered(ringHovered);
    const item = gesture || jointId || ringHovered ? null : pickPlaced(pt.x, pt.y);
    if (item === lastHover) return;
    lastHover = item;
    for (const cb of hoverCbs) cb(item);
  }

  canvas.addEventListener('pointermove', (e) => {
    hoverPending = { x: e.clientX, y: e.clientY };
    if (!hoverRaf) hoverRaf = requestAnimationFrame(runHover);
  });
  canvas.addEventListener('pointerleave', () => {
    hoverPending = null;
    sim.jointGizmo.setHovered(null);
    sim.rotateGizmo.setHovered(false);
    if (lastHover !== null) {
      lastHover = null;
      for (const cb of hoverCbs) cb(null);
    }
  });

  /** R 키 회전 — 진행 중인 제스처가 소유한 대상(고스트 또는 끌고 있는 아이템)을 돌린다.
   *  격자에 딱 맞는 값만 더하므로 `snapYawDeg`는 [0,360) 정규화로만 작동한다(항등 스냅). */
  function rotateDragged(deltaDeg: number): { id: string | null; yawDeg: number } | null {
    const g = gesture;
    if (!g || editLocked) return null;
    if (g.kind === 'library') {
      const spec = getProduct(g.specId);
      // 벽·타공판 고스트는 yaw가 벽 법선에 종속이라 돌릴 자리가 없다 (`ghostShowOnWall`).
      if (!spec || spec.kind === 'surface' || isWallMounted(spec) || isPegboardMounted(spec)) {
        return null;
      }
      ghostYawDeg = snapYawDeg(ghostYawDeg + deltaDeg);
      // 아직 커서를 안 움직여 고스트가 없으면 각도만 쌓아둔다 — 드롭 때 반영된다.
      // 모니터 위에 얹힌 고스트는 상판 좌표로 다시 그리면 안 된다 (DERO-591).
      if (ghostMonitorHit) sim.ghostShowOnMonitorTop(spec, ghostMonitorHit, ghostYawDeg);
      else if (ghostPt) sim.ghostShow(spec, ghostPt.x, ghostPt.z, ghostYawDeg);
      return { id: null, yawDeg: ghostYawDeg };
    }
    if (g.kind === 'item') {
      const it = sim.placed().find((i) => i.id === g.id);
      if (!it) return null;
      const applied = sim.rotateItem(g.id, it.yawDeg + deltaDeg);
      if (applied === null) return null; // 결합 모니터 — 포즈 주인이 암 FK다
      sim.rotateGizmo.sync(sim.rotateHandle(g.id));
      fireChange();
      return { id: g.id, yawDeg: applied };
    }
    return null;
  }

  function attachLibraryDrag(el: HTMLElement, specId: string): void {
    // 카드에 포인터가 닿는 순간 GLB를 예열한다 — 드래그하는 수백 ms 동안 로드가 끝나면
    // pointerup의 await가 이미 resolve돼 있어 배치가 예전처럼 즉각적으로 보인다.
    el.addEventListener('pointerenter', () => {
      const spec = getProduct(specId);
      if (spec) sim.prefetchTemplate(spec);
    });
    el.addEventListener('pointerdown', (e) => {
      if (editLocked) return; // 잠금 중엔 새 아이템도 못 놓는다
      magnetArmId = null;
      const spec = getProduct(specId);
      // 새 드래그는 항상 정면에서 시작한다 — 단, 바닥 제품(의자 등)은 기본 자리가 책상
      // 앞이라 정면(0°)으로 두면 등받이가 책상을 향한다. placeAt의 기본값과 같은 규칙
      // (scene.ts, 2026-08-06) — 여기서도 맞춰야 드래그 릴리스 시 실제로 180°가 넘어간다.
      ghostYawDeg = spec && isFloorMounted(spec) ? 180 : 0;
      ghostPt = null;
      ghostMonitorHit = null;
      if (spec) sim.prefetchTemplate(spec);
      gesture = { kind: 'library', specId, startX: e.clientX, startY: e.clientY, moved: false };
      controls.enabled = false;
      e.preventDefault();
    });
  }

  return {
    placeProduct,
    placeProductAt,
    onPlaceError: (cb) => {
      placeErrorCb = cb;
    },
    onAssetLoading: (cb) => {
      assetLoadingCb = cb;
    },
    attachLibraryDrag,
    placedCount: () => sim.placed().length,
    onChange: (cb) => {
      changeCbs.push(cb);
    },
    onSelect: (cb) => {
      selectCbs.push(cb);
    },
    onHover: (cb) => {
      hoverCbs.push(cb);
    },
    setSelected: (id) => {
      selectedId = id;
    },
    setEditLocked: (locked) => {
      editLocked = locked;
    },
    onJointChange: (cb) => {
      jointCbs.push(cb);
    },
    onRotateChange: (cb) => {
      rotateCbs.push(cb);
    },
    rotateDragged,
    onMountEvent: (cb) => {
      sim.onMountEvent(cb);
    },
    onMoveCommitted: (cb) => {
      moveCommittedCbs.push(cb);
    },
    onItemAdded: (cb) => {
      itemAddedCbs.push(cb);
    },
  };
}
