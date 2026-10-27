// 순수 표면 스냅 수학 — three 임포트 없음, 오브젝트가 z축 수동 조정 없이 표면 위에 자동으로 얹히도록 계산(REQ-SIM-02)

import { mmToM } from './units';
import { monitorStandFootMm } from '../scene/monitor';
import type { ProductSpec } from '../scene/product';

/** Top surface height (m) of a desk standing on the floor (y=0). */
export function surfaceTopYFromFloor(surface: ProductSpec): number {
  return mmToM(surface.heightMm);
}

/** Centre-Y (m) so the item's base rests exactly on the surface top. */
export function snapCenterY(item: ProductSpec, surfaceTopY: number): number {
  return surfaceTopY + mmToM(item.heightMm) / 2;
}

/**
 * 클램프 물림 낙차 (m) — 엣지에 물린 암을 상판 위에서 이만큼 내리면 지지 세그먼트
 * (클램프 조)의 바닥이 상판 **아랫면**에 닿는다 (REQ-SIM-23, D21·D22).
 *
 * 얹기 규약(`snapCenterY`)은 아이템 바닥을 상판 상면에 올려놓기 때문에 클램프가
 * 상판을 물 경로가 없다 — 통째로 상판 위에 얹힌 그림이 된다. 두 로컬 minY의 차는
 * "아이템 바닥에서 클램프 조 바닥까지의 높이"로, 조가 아이템 최하단이면 0이다.
 * `gripMm`은 판정 ①이 쓰는 물림 두께(`clampGripMm`)와 같은 값이어야 한다.
 */
export function clampDropM(
  gripMm: number,
  supportLocalMinY: number,
  itemLocalMinY: number,
): number {
  return mmToM(gripMm) + (supportLocalMinY - itemLocalMinY);
}

/** Item base-Y (m) given its centre. */
export function baseY(item: ProductSpec, centerY: number): number {
  return centerY - mmToM(item.heightMm) / 2;
}

/** True when the item rests on (not floating above / not sunk into) the surface. */
export function restsOnSurface(
  centerY: number,
  item: ProductSpec,
  surfaceTopY: number,
  eps = 1e-4,
): boolean {
  return Math.abs(baseY(item, centerY) - surfaceTopY) <= eps;
}

// --- XZ footprint 수학 (2026-07-21 배치·충돌 개선: 스태킹·경계 규칙) ---

export interface RectXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 겹침 — 면접촉(공유 모서리)은 false (충돌 판정과 동일 규약). */
export function rectsOverlapXZ(a: RectXZ, b: RectXZ): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** inner가 outer 안에 완전 포함 (모서리 접촉 허용). */
export function rectInsideRect(inner: RectXZ, outer: RectXZ, eps = 1e-6): boolean {
  return (
    inner.minX >= outer.minX - eps &&
    inner.maxX <= outer.maxX + eps &&
    inner.minZ >= outer.minZ - eps &&
    inner.maxZ <= outer.maxZ + eps
  );
}

/** (cx, cz) 중심의 규격 footprint 사각형 (m). */
export function specFootprintRect(item: ProductSpec, cx: number, cz: number): RectXZ {
  const hx = mmToM(item.widthMm) / 2;
  const hz = mmToM(item.depthMm) / 2;
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

/**
 * yaw(라디안) 회전한 규격 footprint의 축정렬 경계 사각형 (m).
 * 회전 사각형의 절반 폭은 |cos|·hx + |sin|·hz — 45°에서 최대로 벌어진다.
 * `specFootprintRect`는 이 함수의 yaw=0 특수형이라, 회전을 지원하는 판정
 * 경로(경계·스태킹)는 이 함수를 써야 임의 각도에서 옳다.
 */
export function rotatedFootprintRect(
  item: Pick<ProductSpec, 'widthMm' | 'depthMm'>,
  cx: number,
  cz: number,
  yawRad: number,
): RectXZ {
  const hx = mmToM(item.widthMm) / 2;
  const hz = mmToM(item.depthMm) / 2;
  const c = Math.abs(Math.cos(yawRad));
  const s = Math.abs(Math.sin(yawRad));
  const ex = c * hx + s * hz;
  const ez = s * hx + c * hz;
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
}

// --- 벽 경계 (REQ-SIM-25 / D22): 켜진 벽은 하드 클램프, 꺼진 벽은 제약 없음.
//     소프트 경고·저장 게이트는 2026-08-03 박동규 승인으로 제거됐다 ---

/**
 * 켜져 있는 벽의 평면 좌표 (m). `undefined` = 그 벽이 꺼져 있어 제약 없음.
 * 방 안쪽 = `leftX`보다 크고 `rightX`보다 작고 `frontZ`보다 큰 영역 (뒷벽 없음).
 */
export interface WallPlanes {
  leftX?: number;
  rightX?: number;
  frontZ?: number;
}

/**
 * 중심 (cx, cz)를 켜진 벽 안쪽으로 민다 (하드 클램프). `rect`는 그 중심에서 만든
 * footprint — 회전 footprint를 주면 대각 반폭 기준으로 클램프된다.
 */
export function clampCenterToWalls(
  cx: number,
  cz: number,
  rect: RectXZ,
  walls: WallPlanes,
): { x: number; z: number } {
  const hx = (rect.maxX - rect.minX) / 2;
  const hz = (rect.maxZ - rect.minZ) / 2;
  let x = cx;
  if (walls.leftX !== undefined) x = Math.max(x, walls.leftX + hx);
  if (walls.rightX !== undefined) x = Math.min(x, walls.rightX - hx);
  let z = cz;
  if (walls.frontZ !== undefined) z = Math.max(z, walls.frontZ + hz);
  return { x, z };
}

/** 엣지 스냅이 고정한 축 — 물린 변에 **수직**인 축이다 (앞/뒤 변은 z, 좌/우 변은 x). */
export type PinnedAxis = 'x' | 'z';

/**
 * 엣지 스냅 좌표에 거는 벽 클램프. `pinnedAxis`(변에 수직인 축)는 스냅 좌표가 그대로
 * 이기고, 변을 따라 미끄러지는 축만 벽 안쪽으로 민다.
 *
 * 통짜 `clampCenterToWalls`를 걸면 안 되는 이유: 그쪽은 아이템 **전체 footprint**
 * 반폭만큼 벽 안으로 미는데, 엣지 스냅의 전제는 지지 파트(클램프)만 상판 안이면 되고
 * 암 머리 캔틸리버는 상판 밖 허용이다 (D22 지지 파트 경계 규칙). 두 규칙이 정면
 * 충돌해서 물린 암이 그 차이만큼 상판 안쪽으로 밀려 들어간다 (2026-08-02 시각 QA 반려).
 * 반대로 평행 축까지 놓아 버리면 뒷변에 물린 암을 좌우로 끌어 벽을 통과시킬 수 있다.
 */
export function clampCenterToWallsAlongEdge(
  cx: number,
  cz: number,
  rect: RectXZ,
  walls: WallPlanes,
  pinnedAxis: PinnedAxis,
): { x: number; z: number } {
  const clamped = clampCenterToWalls(cx, cz, rect, walls);
  return pinnedAxis === 'x' ? { x: cx, z: clamped.z } : { x: clamped.x, z: cz };
}

/**
 * 변을 따라 미끄러지는 좌표를 상판 안으로 민다 — 지지 박스 [coord+extMin, coord+extMax]가
 * [−halfExtent, halfExtent] 안에 들도록 (DERO-467). 위 벽 클램프는 벽만 보고 상판
 * 사각형은 안 보므로, 이게 없으면 엣지 락 암을 변 끝(코너) 밖까지 끌 수 있고 클램프
 * 지지 박스가 인접 변을 넘어 진짜 경계 위반이 된다.
 *
 * `extMin`/`extMax`는 중심 기준 **월드축** 오프셋 — 요→월드 부호 매핑은 호출자(scene.ts)
 * 소유, 이 함수는 포즈를 모른다.
 */
export function clampAlongEdgeToDesk(
  coord: number,
  extMin: number,
  extMax: number,
  halfExtent: number,
): number {
  const lo = -halfExtent - extMin;
  const hi = halfExtent - extMax;
  if (lo > hi) return (lo + hi) / 2; // 지지 박스가 상판보다 넓다 — 중앙 정렬
  return Math.min(Math.max(coord, lo), hi);
}

/**
 * 아이템 footprint 아래의 최상단 **지지면** — 책상 상판 또는 XZ가 겹치는 `supportSurfaces`
 * 중 가장 높은 것 (ADR-0023 결정 1·10, DERO-431 개정).
 *
 * 지지면이 아이템당 하나라고 가정하지 말 것 — 그것을 정하는 것은 `supportSurfaces`다.
 * 실메쉬 형상은 읽지 않는다 — 규격 파생 박스뿐이다. `stackable` 게이트도 카테고리 표도 없다
 * (ADR-0023 결정 8: 아래 표면이 있으면 얹힌다). 이 높이는 **드롭 순간의 초기값**일 뿐이고
 * 그 뒤로는 사용자가 준 높이가 정본이다 (결정 4).
 */
export function supportTopY(item: RectXZ, deskTopY: number, supports: SupportSurface[]): number {
  let top = deskTopY;
  for (const s of supports) {
    if (rectsOverlapXZ(item, s.rect) && s.topY > top) top = s.topY;
  }
  return top;
}

/** 아이템이 내놓는 지지면 하나 — 그 위에 다른 아이템이 얹힐 수 있는 사각형과 높이. */
export interface SupportSurface {
  rect: RectXZ;
  topY: number;
}

/**
 * 이 아이템이 내놓는 지지면 목록 (ADR-0023 결정 1·10 개정, DERO-431).
 *
 * **대부분 제품은 하나다** — 규격 footprint × 규격 박스 상단, 종전과 같다.
 *
 * **모니터만 다르다.** 통짜 규격 박스를 지지면으로 쓰면 패널 아래·목 옆의 빈 공간까지
 * 박스가 점유해서, 27"(614W × 130D × 542H)의 경우 그 614×130mm 띠 안에 놓인 것이 전부
 * 상판 +542mm(= 모니터 꼭대기)로 초기화된다 — 모니터 밑에 받침대를 못 넣고, 목 옆에
 * 소품을 못 놓는다. 상판 높이에 실제로 있는 것은 스탠드 발판(200 × standDepthMm × 14)
 * 뿐이라 그것만 내놓고, **패널은 지지면을 내놓지 않는다**(모니터 위에는 아무것도 얹지
 * 않는다 — 얹고 싶으면 수동 높이가 정본이다, 결정 4).
 *
 * **모니터암도 아무것도 내놓지 않는다** (DERO-455). 같은 결함이 한 칸 옆에 있었다:
 * `monitor-arm-white`의 규격 박스는 100W × 385D × 400H mm인데 뒷변에 물려 상판 안쪽으로
 * 385mm 뻗으므로 **키보드 자리가 그 띠 안**이다. 통짜 박스를 지지면으로 쓰면 그 자리에
 * 놓인 것이 전부 상판 +400mm(= 암 꼭대기)로 초기화돼 공중에 뜬다. 캔틸레버 구조라 폴에도
 * 암 세그먼트에도 물건을 얹지 못하니 내놓을 지지면이 없는 것이 맞다.
 *
 * **클램프 베이스만 내놓는 선택지는 없다** — 그 치수는 리그 세그먼트(메쉬)에만 있고 규격
 * DB에는 컬럼이 없다. 메쉬를 재는 순간 ADR-0023이 지킨 분리가 깨진다. 대신 암 폴과 겹치는
 * 자리는 상판 높이로 초기화되고, 겹침은 파트별 OBB 충돌이 빨간색으로 잡는다 —
 * **공중 부양보다 낫다**(엔진은 자세를 정하지 않는다, ADR-0023 결정 4).
 *
 * 메쉬는 읽지 않는다 — 발판 치수는 전부 규격(`standDepthMm`)·상수 파생이다.
 * VESA로 암에 결합된 모니터는 호출자(`resolveSupportY`)가 이미 후보에서 뺀다.
 */
export function supportSurfaces(
  spec: ProductSpec,
  center: { x: number; y: number; z: number },
  yawRad: number,
): SupportSurface[] {
  const half = mmToM(spec.heightMm) / 2;
  if (spec.arm) return [];
  if (spec.monitor) {
    const foot = monitorStandFootMm(spec.monitor);
    return [
      {
        rect: rotatedFootprintRect(foot, center.x, center.z, yawRad),
        topY: center.y - half + mmToM(foot.topMm),
      },
    ];
  }
  return [{ rect: rotatedFootprintRect(spec, center.x, center.z, yawRad), topY: center.y + half }];
}

/** 모니터 위에 얹을 수 있는 제품인가 — 상판 스냅을 타는 제품만이다 (DERO-591).
 *  바닥·벽·타공판 제품은 기준면 자체가 달라 갈래가 애초에 갈린다.
 *
 *  **모니터암은 제외한다** — 암은 상판 변에 물려야 하고(`edgeSnapTarget`이 배치 직후 x·z를
 *  변으로 다시 끌어간다) 그러면 좌표는 상판 변인데 높이만 패널 상단인 유령이 남는다.
 *  캔틸레버를 패널에 얹는 조작은 실제로도 없다. */
export function canRestOnMonitor(spec: Pick<ProductSpec, 'mountSurface' | 'arm'>): boolean {
  return usesDeskSnap(spec) && !isPegboardMounted(spec) && !spec.arm;
}

/**
 * 이 아이템이 저 모니터의 패널 상단에 얹혀 있는가 (DERO-591).
 *
 * 패널은 지지면을 안 내놓으므로(결정 3·4) 얹힘 판정(`restsOnSurface` + 지지면 탐색)이 이
 * 상태를 못 본다. **이동 경로가 이걸 안 세면 패널 위를 스쳐 지나간 아이템이 상판으로 안
 * 내려온다** — 높이만 +542mm인 채 상판을 떠다니고, 그것이 431 증상 ②의 재발이다.
 */
export function restsOnMonitorTop(
  item: { spec: Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm'>; center: { y: number } },
  host: {
    spec: Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm'>;
    center: { x: number; y: number; z: number };
    yawRad: number;
  },
  itemRect: RectXZ,
): boolean {
  const top = host.center.y + mmToM(host.spec.heightMm) / 2;
  if (Math.abs(item.center.y - mmToM(item.spec.heightMm) / 2 - top) > 1e-4) return false;
  return rectsOverlapXZ(
    itemRect,
    rotatedFootprintRect(host.spec, host.center.x, host.center.z, host.yawRad),
  );
}

/**
 * 모니터 패널 상단에 얹을 때의 규격 박스 중심 (m) — ADR-0024 결정 4 개정
 * (DERO-591, 승인 박동규 2026-08-11).
 *
 * **`supportSurfaces`는 그대로다** — 패널은 여전히 지지면을 안 내놓는다(결정 3·4).
 * 같은 XZ에 유효 타깃이 둘(패널 위 / 패널 아래 상판)이라 XZ 기반 자동 규칙으로는 의도를
 * 가를 수 없기 때문이다 — 되돌리면 431 증상 ①②(모니터 밑 받침대·목 옆 소품이 꼭대기로
 * 튐)가 그대로 돌아온다. 의도를 가르는 것은 **커서 레이가 모니터 메쉬를 맞혔는가** 하나뿐이고
 * 그 판정은 씬(`pickMonitorTop`)이 한다 — 여기는 그 뒤의 순수 좌표 수학이다.
 *
 * - **높이**: 호스트 규격 박스 상단 = 패널 상단(`monitorDims`의 heightMm가 스탠드+패널이다).
 *   얹은 뒤 높이는 사용자 소관이다(ADR-0023 결정 4) — 이 값은 초기값일 뿐이다.
 * - **x**: 커서를 따라가되 아이템이 패널 폭 안에 남도록 클램프한다. 기준은 호스트의
 *   **로컬 좌우축**이라 모니터가 돌아 있으면 추종축도 같이 돈다. 클램프 여유는 아이템의
 *   폭이 아니라 **그 축으로 회전 투영한 반폭**이다 — R로 90° 돌린 아이템은 폭이 아니라
 *   깊이가 그 축을 차지한다(폭으로 재면 패널 밖으로 삐져나온다).
 * - **z**: 커서를 안 본다. 패널은 두께 28mm 판이라 깊이 자유도가 사실상 없다 — 호스트 중심
 *   z(= 패널 중심)에 얹는다.
 */
export function resolveMonitorTopPose(
  item: {
    spec: Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm'>;
    yawRad: number;
  },
  host: {
    center: { x: number; y: number; z: number };
    widthMm: number;
    heightMm: number;
    yawRad: number;
  },
  hit: { x: number; z: number },
): { x: number; y: number; z: number } {
  const cos = Math.cos(host.yawRad);
  const sin = Math.sin(host.yawRad);
  // 호스트 로컬 +X축의 월드 방향 = (cos, 0, -sin) — three의 Y축 회전 정의 그대로다.
  const along = (hit.x - host.center.x) * cos - (hit.z - host.center.z) * sin;
  // 그 축이 먹는 아이템 반폭 — 호스트와의 상대 yaw로 회전 투영한다.
  const rel = item.yawRad - host.yawRad;
  const halfAlong =
    (Math.abs(Math.cos(rel)) * mmToM(item.spec.widthMm)) / 2 +
    (Math.abs(Math.sin(rel)) * mmToM(item.spec.depthMm)) / 2;
  const limit = Math.max(0, mmToM(host.widthMm) / 2 - halfAlong);
  const clamped = Math.min(Math.max(along, -limit), limit);
  return {
    x: host.center.x + clamped * cos,
    y: host.center.y + mmToM(host.heightMm) / 2 + mmToM(item.spec.heightMm) / 2,
    z: host.center.z - clamped * sin,
  };
}

// --- 배치면 분기 (`prop.mount_surface`, DERO-375 2026-08-03) ---
// 바닥 제품(풋레스트 등)은 기준면이 상판이 아니라 월드 바닥이다. 기준 y·스태킹·
// 상판 경계 판정 셋이 같이 갈리므로 규칙을 여기 한 곳에 모은다.

/** 월드 바닥 y (m) — 그라운드 메쉬·책상 다리 밑면·컨택트 섀도우 리그가 전부 원점이다. */
const FLOOR_Y = 0;

/** 바닥에 놓이는 제품인가 (`prop.mount_surface = 'FLOOR'`). 값이 없으면 상판 배치다. */
export function isFloorMounted(spec: Pick<ProductSpec, 'mountSurface'>): boolean {
  return spec.mountSurface === 'FLOOR';
}

/** 벽에 붙는 제품인가 (`prop.mount_surface = 'WALL'`). `'PEGBOARD'`는 벽이 아니라
 *  **다른 아이템(타공판)의 앞면**에 붙으므로 여기서 같이 묶지 말 것 — 아래
 *  `isPegboardMounted`가 그 갈래다. */
export function isWallMounted(spec: Pick<ProductSpec, 'mountSurface'>): boolean {
  return spec.mountSurface === 'WALL';
}

/** 타공판에 붙는 제품인가 (`prop.mount_surface = 'PEGBOARD'`) — 후크, 그리고 그 후크에
 *  걸리는 제품이 전부 이 값이다. 붙을 자리는 벽 평면이 아니라 호스트 아이템의 앞면이라
 *  씬이 호스트를 레이캐스트로 집어 준다 (DERO-518). */
export function isPegboardMounted(spec: Pick<ProductSpec, 'mountSurface'>): boolean {
  return spec.mountSurface === 'PEGBOARD';
}

/**
 * 상판 스냅(규격 박스 스태킹)을 타는 제품인가. 바닥·벽 제품은 기준면 자체가 상판이 아니라서
 * 지지면 탐색을 건너뛴다 — 안 건너뛰면 상판 위 아이템의 박스 상단이 기준 y를 덮어써서
 * 도로 상판으로 올라간다 (FLOOR에서 실제로 났던 함정).
 *
 * **지지면 탐색 자체의 게이트는 아니다** — 바닥 제품끼리는 얹힌다(`sharesMountPlane`).
 * 상판 경계 판정 제외(`violatesDeskBoundary`)에만 쓴다.
 */
export function usesDeskSnap(spec: Pick<ProductSpec, 'mountSurface'>): boolean {
  return !isFloorMounted(spec) && !isWallMounted(spec);
}

/**
 * 지지면 후보로 볼 짝인가 — **배치면이 같은 것끼리만 얹힌다** (DERO-517).
 *
 * 바닥 제품끼리도 얹혀야 한다: 러그 위 의자는 러그 상단에서 시작해야 `inferSeatedOnId`가
 * 얹힘으로 잡고 그 쌍만 겹침 경고에서 빠진다(`scene.ts`). 둘 다 y=0에서 시작하면 규격
 * 박스가 통째로 관통해 항상 빨강이다.
 *
 * 배치면이 다르면 못 얹힌다 — 이 필터가 곧 DERO-375의 함정 방지다(상판 아이템의
 * 박스 상단이 바닥 제품의 기준 y를 덮어써서 도로 상판으로 올라간다).
 */
export function sharesMountPlane(
  a: Pick<ProductSpec, 'mountSurface'>,
  b: Pick<ProductSpec, 'mountSurface'>,
): boolean {
  return isFloorMounted(a) === isFloorMounted(b);
}

/** 아이템의 기준 지지면 y (m) — 얹힐 아이템이 없을 때의 바닥값이자 바닥 제품의 높이. */
export function baseSupportY(spec: Pick<ProductSpec, 'mountSurface'>, deskTopY: number): number {
  return isFloorMounted(spec) ? FLOOR_Y : deskTopY;
}

/**
 * 상판 경계 판정 관용치 (m) — 규격 반올림·부동소수 노이즈만 흡수한다. 2mm는 실물 상판
 * 모서리 라운드 안이라 "상판에 들어간다"는 판정을 거짓으로 만들지 않는다.
 *
 * **cm 단위로 키우지 말 것.** DERO-160에서 벽 판정에 3cm를 줬더니 실측 1.5cm의
 * 진짜 위반이 같이 통과됐고, 1.5/1/0.5cm 이분 탐색으로도 진짜 위반과 정당한 캔틸리버를
 * 가르는 값이 없다는 결론이 났다(그 축은 관용치가 아니라 판정 대상 축소로 닫혔다).
 * 관절 에셋(모니터암)에는 이 값(2mm)을 쓰지 않는다 — 엣지 스냅으로 상판 변에 물리는 것이
 * 정상 자리라 판정 접점이 변 자체이고, 2mm 여유는 실제로 못 물리는 물림을 통과시킨다.
 * 관절 에셋은 아래 `RIG_BOUNDARY_EPS_M`을 쓴다.
 */
export const DESK_BOUNDARY_EPS_M = 0.002;

/**
 * 관절 에셋(rig 지지 파트) 경계 판정 관용치 (m) — 0.1mm. 산술 노이즈만 흡수한다.
 *
 * 엣지 스냅은 물림 깊이를 아이템-로컬 AABB(`clampReachM` = `-support.min.z`)로 계산해
 * 물림 면을 정확히 상판 변 위에 놓는데, 경계 판정은 같은 footprint를 월드 OBB 코너
 * (`footprintRectXZ`)로 다시 계산한다 — 두 산술 경로(GLB 3.33× 스케일 보정·행렬 왕복
 * 포함, 최악 ~5e-5m)는 부동소수 수준까지만 일치해서, eps 0이면 정상 엣지 락 상태가
 * 드래그 중 간헐적으로 위반 판정된다 (DERO-467, CA-2 실측).
 *
 * **mm 단위로 키우지 말 것.** 진짜 물림 실패(자유 배치 드래그·오배치)는 ≥1mm 스케일이라
 * 0.1mm는 통과 못 시킨다 — 그 위로 키우면 위 DERO-160의 실패가 재현된다.
 */
export const RIG_BOUNDARY_EPS_M = 1e-4;

/**
 * 상판 경계 위반 여부 (빨강 표시 + 저장 차단의 입력). 바닥 제품은 책상 **밑·옆**이
 * 정당한 자리라 이 판정 대상이 아니다. 타공판 부착 제품(`'PEGBOARD'`)도 판정 제외 —
 * 벽에 붙은 판 앞면에 매달리므로 상판 사각형과 겹칠 이유가 없다. `usesDeskSnap`이 아니라
 * 여기서만 빼는 이유는 그 함수가 지지면 탐색 게이트로도 쓰이기 때문이다 (2026-08-06).
 * `supportRect`가 없으면(지지 파트 미배선) 종전대로 위반 아님. `eps`는 호출자가
 * 경로별로 정한다(기본 0 = 관용치 없음).
 */
export function violatesDeskBoundary(
  spec: Pick<ProductSpec, 'mountSurface'>,
  supportRect: RectXZ | null,
  deskRect: RectXZ,
  eps = 0,
): boolean {
  if (!usesDeskSnap(spec)) return false; // 바닥·벽 제품은 상판 밖이 정당한 자리다
  if (spec.mountSurface === 'PEGBOARD') return false; // 타공판은 상판을 넘는 게 정상이다
  return supportRect ? !rectInsideRect(supportRect, deskRect, eps) : false;
}

// --- 벽 배치 (`prop.mount_surface = 'WALL'`, DERO-375 2026-08-03) --------
// 벽 아이템은 상판 아이템과 세 가지가 다르다: ①y가 파생값이 아니라 **저장값**이다
// (상판 아이템의 y는 지지면에서 매번 다시 유도된다) ②yaw가 벽에 종속돼 고정이다
// ③수평 클램프가 벽 법선 축을 건드리면 안 된다(벽에서 떨어진다).

/**
 * 엔진 벽 면 — 좌·전면·우 3면이다(뒷벽·천장 없음).
 *
 * **저장·API의 `WallSide`(`src/types/placement.ts`)는 대문자라 이름만 같은 별개 타입이다.**
 * 변환은 `src/utils/wallSide.ts` 한 곳에서만 한다.
 */
export type WallSide = 'left' | 'front' | 'right';

/** 벽 메쉬 높이 (m) — 씬의 벽 지오메트리와 수직 클램프가 같은 값을 봐야 한다. */
export const WALL_HEIGHT_M = 2.6;

/**
 * 벽에 붙은 아이템의 고정 yaw(도) — 뒷면이 벽에 밀착하고 앞면이 방을 본다.
 *
 * 유도: three의 Y 회전이 로컬 +Z를 `(sin y, 0, cos y)`로 보내고, 앞면(로컬 +Z)이 그 벽의
 * 내향 법선을 봐야 한다. 좌 벽 법선 +X → 90°, 전면 벽 법선 +Z → 0°, 우 벽 법선 −X → 270°.
 */
export const WALL_YAW_DEG: Readonly<Record<WallSide, number>> = {
  left: 90,
  front: 0,
  right: 270,
};

/** 그 벽의 내향 법선 부호 (좌 +X / 전면 +Z / 우 −X). */
function inwardSign(side: WallSide): number {
  return side === 'right' ? -1 : 1;
}

/** 장식(슬랫 등)이 있는 벽에서 아이템 앞면이 그 장식보다 최소한 이만큼은 더 튀어나와야
 *  한다(m) — 얇은 벽걸이 제품이 장식 뒤로 통째로 숨는 것을 막는 최소 여유일 뿐이고,
 *  장식 없는 벽(대부분의 배치)에는 전혀 영향을 주지 않는다(2026-08-06). 타공판은 이
 *  값이 아니라 아래 `PEGBOARD_STANDOFF_M`을 쓴다 — 5mm로는 슬랫에 거의 다 파묻힌
 *  채라 육안으로 차이가 없었다(2026-08-06 재보고, 타공판닷컴 원형 타공판). */
const WALL_ITEM_MIN_REVEAL_M = 0.005;

/** 카테고리 마스터 "타공판"(정리·거치 하위, `constants/productCategoryGroup.ts`
 *  `sub-pegboard`와 같은 id) — 실 카탈로그 categoryId 정본, 실측 DB 기준(69). */
const PEGBOARD_CATEGORY_ID = 69;

/** 타공판류는 실제로도 벽에서 띄우는 스탠드오프 마운트로 고정한다(구멍에 후크를 꽂을
 *  손 공간이 필요하다) — 장식 유무·두께와 무관하게 항상 이만큼은 벽(또는 장식) 밖으로
 *  튀어나오게 한다. 가장 두꺼운 테마 장식(오크 웜 14mm)보다 확실히 크게 잡아, 장식이
 *  있는 벽에서도 겹쳐 보이지 않고 확실히 앞에 떠 보이게 한다(2026-08-06 사용자 요청 —
 *  "벽 앞에 놓여있게"). ADR-0021의 20mm 장식 캡과는 무관한 값이다(그건 장식이 얼마나
 *  튀어나올 수 있는지의 상한이지, 제품이 벽에서 얼마나 떨어지는지의 규칙이 아니다). */
const PEGBOARD_STANDOFF_M = 0.025;

/** 타공판류 제품인가 — 실 카탈로그 categoryId(69)를 우선 보고, mock/누락 시 라벨
 *  문자열로 한 번 더 확인한다. 메쉬가 아니라 스펙 메타데이터만 보므로 mesh/spec 분리
 *  원칙(D7)에 어긋나지 않는다. */
export function isPegboardProduct(spec: Pick<ProductSpec, 'categoryId' | 'categoryName'>): boolean {
  return spec.categoryId === PEGBOARD_CATEGORY_ID || spec.categoryName === '타공판';
}

/** 벽 법선 축 — 좌·우 벽은 x, 전면 벽은 z. **벽 이격이 이 축을 정하므로 클램프가
 *  건드리면 안 된다**(건드리면 아이템이 벽에서 떨어져 공중에 뜬다). */
export function wallNormalAxis(side: WallSide): PinnedAxis {
  return side === 'front' ? 'z' : 'x';
}

/**
 * 벽 아이템의 중심 y 클램프 — 바닥(0) 아래로도, 벽 높이 위로도 못 나간다. 규격
 * `heightMm` 기준이다(메쉬 치수 금지). 아이템이 벽보다 높으면 클램프 구간이 없어져
 * 벽 한가운데로 고정한다.
 */
export function clampWallCenterY(
  spec: Pick<ProductSpec, 'heightMm'>,
  centerY: number,
  wallHeightM: number = WALL_HEIGHT_M,
): number {
  const half = mmToM(spec.heightMm) / 2;
  if (half * 2 >= wallHeightM) return wallHeightM / 2;
  return Math.min(Math.max(centerY, half), wallHeightM - half);
}

/** 벽에 붙인 아이템의 규격 박스 중심과 자세. */
export interface WallPose {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
}

const DEG2RAD = Math.PI / 180;

/**
 * 벽면 위의 한 점(레이캐스트 히트)에 아이템 뒷면을 붙였을 때의 규격 박스 중심·자세.
 *
 * - 벽 법선 방향: 벽면 + 내향 법선 × 규격 `depthMm`/2 — **규격을 쓴다**(메쉬 치수 금지, D7).
 * - 벽면을 따라가는 축: 히트 좌표 그대로 두되 켜진 벽 안쪽으로 클램프한다. 클램프는
 *   `clampCenterToWallsAlongEdge`로 걸어 벽 법선 축을 고정한다.
 * - y: 히트 높이를 바닥·벽 높이 안으로 클램프한 값. **이 값이 저장되는 y다.**
 *
 * `planeCoord`는 그 벽의 평면 좌표다 (좌·우 벽은 x, 전면 벽은 z). 전면 벽은 책상 깊이에
 * 종속이라 캐시하지 말고 매번 넘길 것.
 *
 * `decorDepthM`(m, 기본 0)은 그 벽면 앞에 튀어나온 테마 장식(슬랫 등)의 깊이다 — 뒷면을
 * 맨 벽 평면에 붙이는 원칙은 그대로지만, 장식이 있으면 앞면이 최소한 그 장식 밖으로는
 * 나오게 보정한다. 안 그러면 장식보다 얇은 벽걸이 제품이 통째로 장식 뒤에 숨어 버린다 —
 * 두꺼운 제품(원래도 장식보다 더 튀어나오는)은 이 보정으로 값이 안 바뀐다. 장식 없는 벽
 * (`decorDepthM`이 기본값 0)에서는 이 식이 항상 원래 공식과 같은 값을 낸다(2026-08-06,
 * ADR-0021의 "최대 20mm 관통" 가드는 아이템이 장식보다 두꺼울 때 얘기고 더 얇은 경우까지는
 * 막아주지 않는다). **타공판류는 예외** — 장식 유무와 무관하게 항상 `PEGBOARD_STANDOFF_M`
 * 만큼 띄운다(실제 스탠드오프 마운트 재현, 2026-08-06 2차 요청).
 */
export function resolveWallPose(
  spec: Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm' | 'categoryId' | 'categoryName'>,
  side: WallSide,
  planeCoord: number,
  hit: { x: number; y: number; z: number },
  walls: WallPlanes,
  wallHeightM: number = WALL_HEIGHT_M,
  decorDepthM: number = 0,
): WallPose {
  const yawDeg = WALL_YAW_DEG[side];
  const depthM = mmToM(spec.depthMm);
  const frontFaceM = isPegboardProduct(spec)
    ? Math.max(depthM, decorDepthM + PEGBOARD_STANDOFF_M)
    : decorDepthM > 0
      ? Math.max(depthM, decorDepthM + WALL_ITEM_MIN_REVEAL_M)
      : depthM;
  const offset = inwardSign(side) * (frontFaceM - depthM / 2);
  const x = side === 'front' ? hit.x : planeCoord + offset;
  const z = side === 'front' ? planeCoord + offset : hit.z;
  const rect = rotatedFootprintRect(spec, x, z, yawDeg * DEG2RAD);
  const walled = clampCenterToWallsAlongEdge(x, z, rect, walls, wallNormalAxis(side));
  return { x: walled.x, y: clampWallCenterY(spec, hit.y, wallHeightM), z: walled.z, yawDeg };
}

// --- 타공판 부착 (`prop.mount_surface = 'PEGBOARD'`, DERO-518) ----------
// 타공판 아이템은 벽이 아니라 **다른 아이템의 앞면**에 붙는다. 벽 아이템과 세 축이 같고
// (y가 파생값이 아니라 저장값 · yaw가 벽 면에 종속 · 지지면 탐색을 안 탄다) 기준면만
// 다르다 — 벽 평면 대신 호스트 규격 박스의 앞면이다. 그래서 호스트가 타공판 패널이든
// 이미 붙어 있는 후크든 식이 하나이고, 체인 깊이에 제한이 없다.
//
// **홀 격자에 정렬하지 않는다** — 연속 좌표다. 홀 피치는 규격 DB에 컬럼이 없고(메쉬를
// 재는 것은 D7 위반), 실물 후크는 25mm 안팎 간격이라 이 카메라 거리에서 어긋남이 안
// 읽힌다. 격자가 필요해지면 `prop`에 피치 컬럼을 더하고 아래 두 함수의 along·y를
// 양자화하는 것이 업그레이드 경로다.

/**
 * 부착 호스트의 규격 박스 — 중심과 치수뿐이다. **메쉬는 안 읽는다**(D7).
 * `widthMm`은 벽면을 따라가는 축, `depthMm`은 벽 법선 축이다 — 벽 아이템의 yaw가
 * 벽에 종속돼 고정이라(`WALL_YAW_DEG`) 이 대응이 세 면 모두에서 성립한다.
 */
export interface MountHostBox {
  center: { x: number; y: number; z: number };
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

/** 벽면을 따라가는 축 — 벽 법선 축(`wallNormalAxis`)의 반대다. */
export function wallAlongAxis(side: WallSide): PinnedAxis {
  return side === 'front' ? 'x' : 'z';
}

/** 아이템을 호스트 구간 안으로 민다. 아이템이 호스트보다 크면 구간이 없으므로 중앙 정렬 —
 *  `clampWallCenterY`가 벽보다 큰 아이템에 쓰는 규약과 같다. */
function clampWithinHost(v: number, hostCenter: number, hostHalf: number, itemHalf: number) {
  if (itemHalf >= hostHalf) return hostCenter;
  return Math.min(Math.max(v, hostCenter - hostHalf + itemHalf), hostCenter + hostHalf - itemHalf);
}

/** 호스트 앞면의 벽 법선 축 좌표 (m). */
function hostFrontCoord(host: MountHostBox, side: WallSide): number {
  const c = wallNormalAxis(side) === 'x' ? host.center.x : host.center.z;
  return c + inwardSign(side) * (mmToM(host.depthMm) / 2);
}

/** 앞면 좌표에 아이템 뒷면을 붙였을 때의 규격 박스 중심·자세. */
function frontMountPose(
  spec: Pick<ProductSpec, 'depthMm'>,
  side: WallSide,
  frontCoord: number,
  along: number,
  centerY: number,
): WallPose {
  const coord = frontCoord + inwardSign(side) * (mmToM(spec.depthMm) / 2);
  const onX = wallNormalAxis(side) === 'x';
  return {
    x: onX ? coord : along,
    y: centerY,
    z: onX ? along : coord,
    yawDeg: WALL_YAW_DEG[side],
  };
}

/**
 * 타공판 **패널** 앞면의 한 점에 아이템 뒷면을 붙였을 때의 포즈 — 패널 위 자유 배치다.
 * 벽면을 따라가는 축과 y 둘 다 패널 밖으로 안 나가게 민다(안 그러면 후크가 판 옆 허공에
 * 붙는다). 벽 클램프는 따로 안 건다 — 패널 자체가 이미 벽 안에 클램프돼 있다.
 */
export function resolvePegboardPose(
  spec: Pick<ProductSpec, 'widthMm' | 'depthMm' | 'heightMm'>,
  side: WallSide,
  host: MountHostBox,
  hit: { x: number; y: number; z: number },
): WallPose {
  const onX = wallAlongAxis(side) === 'x';
  const along = onX ? hit.x : hit.z;
  const hostAlong = onX ? host.center.x : host.center.z;
  return frontMountPose(
    spec,
    side,
    hostFrontCoord(host, side),
    clampWithinHost(along, hostAlong, mmToM(host.widthMm) / 2, mmToM(spec.widthMm) / 2),
    clampWithinHost(hit.y, host.center.y, mmToM(host.heightMm) / 2, mmToM(spec.heightMm) / 2),
  );
}

/**
 * 이미 타공판에 붙어 있는 것(후크)에 **걸었을** 때의 포즈. 패널 부착과 달리 자리가
 * 호스트에 고정된다 — 벽면 축은 후크 중심, y는 **아이템 상단이 후크 상단에 맞물리는**
 * 높이다(걸이의 정의). 앞면 기준이 후크 앞면이라 체인이 한 칸 더 앞으로 나간다.
 */
export function resolveHookHangPose(
  spec: Pick<ProductSpec, 'depthMm' | 'heightMm'>,
  side: WallSide,
  hook: MountHostBox,
): WallPose {
  const onX = wallAlongAxis(side) === 'x';
  const hookTop = hook.center.y + mmToM(hook.heightMm) / 2;
  return frontMountPose(
    spec,
    side,
    hostFrontCoord(hook, side),
    onX ? hook.center.x : hook.center.z,
    hookTop - mmToM(spec.heightMm) / 2,
  );
}
