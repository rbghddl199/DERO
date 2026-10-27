// 벽면 마감이 공유하는 연속 부조 지오메트리 빌더 — 우드 슬랫·수평 띠(걸레받이/몰딩)
//
// 마감이 **면 단위**가 된 뒤로(ADR-0030 결정 1) 빌더도 면 하나만 받는다. 면 3개를 한 번에
// 받던 옛 시그니처는 계열이 면마다 다를 수 있는 지금 성립하지 않는다.
import * as THREE from 'three/webgpu';
import type { WallSide } from '@/three/core/snap';
import type { WindowRectM } from '@/three/core/window';
import type { FinishContext } from '@/three/finishes/types';

/**
 * 벽면 로컬 좌표(u = 벽 가로, 중앙 0 / y = 높이 / d = 방 안쪽으로 나온 깊이)를 월드 배치로 옮긴다.
 * 놓이는 물체는 로컬 x가 벽 가로, y가 높이, **z가 방 안쪽**을 향하는 박스여야 한다.
 *
 * 좌·우 벽은 `wallPlaneCoord`가 x, 전면 벽은 z다(전면 z는 책상 깊이를 따라 움직이므로
 * 값을 캐시하지 않고 넘겨받은 ctx에서 매번 읽는다).
 */
function poseOnWall(
  side: WallSide,
  ctx: FinishContext,
  u: number,
  y: number,
  d: number,
  target: THREE.Object3D,
): void {
  const c = ctx.wallPlaneCoord[side];
  if (side === 'left') {
    target.position.set(c + d, y, u);
    target.rotation.y = Math.PI / 2;
  } else if (side === 'right') {
    target.position.set(c - d, y, u);
    target.rotation.y = -Math.PI / 2;
  } else {
    target.position.set(u, y, c + d);
    target.rotation.y = 0;
  }
}

export interface WallBandOptions {
  /** 띠 중심 높이(m). */
  readonly centerY: number;
  /** 띠 세로 폭(m). */
  readonly heightM: number;
  /** 방 안쪽 돌출(m) — `MAX_RELIEF_PROTRUSION_M` 이하여야 한다. */
  readonly depthM: number;
}

/** 걸레받이·몰딩 같은 수평 띠 하나. */
export function buildWallBand(
  ctx: FinishContext,
  material: THREE.Material,
  side: WallSide,
  o: WallBandOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(ctx.wallWidthM[side], o.heightM, o.depthM),
    material,
  );
  // 박스 중심을 깊이의 절반만큼 들여야 뒷면이 벽 평면에 딱 붙고 앞으로 depthM만 나온다.
  poseOnWall(side, ctx, 0, o.centerY, o.depthM / 2, mesh);
  mesh.receiveShadow = true;
  return mesh;
}

export interface SlatOptions {
  /** 판재 반복 간격(m). */
  readonly pitchM: number;
  /** 판재 폭(m) — pitch보다 작아야 홈이 생긴다. */
  readonly widthM: number;
  /** 방 안쪽 돌출(m) — `MAX_RELIEF_PROTRUSION_M` 이하여야 한다. */
  readonly depthM: number;
  readonly bottomY: number;
  readonly topY: number;
  /** 그 면의 창문 사각형 — 겹치는 열은 개구부 위·아래 두 토막으로 나뉜다. 없으면 통짜다. */
  readonly windowRect?: WindowRectM | null;
}

/** 판재 한 토막 — 열 인덱스는 잡음 시드라 토막이 나뉘어도 따라다녀야 한다. */
interface SlatPiece {
  readonly column: number;
  readonly u: number;
  readonly centerY: number;
}

/**
 * 우드 슬랫 판재 — **InstancedMesh 강제**(ADR-0021 결정 5). 한 면만 60장이 넘어가므로 일반
 * Mesh로 깔면 drawcall이 그대로 판재 수가 된다. 창문이 없으면 종전대로 면당 하나다.
 *
 * **창문이 있으면 겹치는 열을 개구부 위·아래로 자른다**(2026-08-10). 마감은 구멍을 못 뚫으므로
 * (ADR-0030 결정 5) 안 덮는 것이 유일한 수단이다. 토막 길이가 셋(통짜·아래·위)이라 길이마다
 * InstancedMesh를 하나씩 세운다 — **높이를 인스턴스 스케일로 주면 안 된다**: 나뭇결
 * (`nodes.ts` `woodGrainColor`)이 `positionLocal`을 미터로 읽으므로 단위 박스를 늘리면 짧은
 * 토막의 결이 그만큼 눌린다. 그래서 지오메트리 높이가 곧 실제 높이다. drawcall은 창문 있는
 * 면에서만 최대 3이고, 판재 수(60+)와는 여전히 무관하다.
 *
 * 세 메쉬 모두 **열 수만큼** 인스턴스를 갖고 자기 몫이 아닌 열은 스케일 0으로 접는다 —
 * `slatColor`의 색 흔들림이 `instanceIndex`를 시드로 쓰기 때문에(`nodes.ts`) 인스턴스 번호가
 * 열 번호와 어긋나면 같은 열의 위·아래 토막이 서로 다른 색이 되고 이웃 열과도 색이 겹친다.
 */
export function buildSlats(
  ctx: FinishContext,
  material: THREE.Material,
  side: WallSide,
  o: SlatOptions,
): THREE.Group {
  const group = new THREE.Group();
  const n = Math.max(1, Math.floor(ctx.wallWidthM[side] / o.pitchM));
  const first = -((n - 1) * o.pitchM) / 2; // 벽 중앙 대칭 — 어느 시점에서도 한쪽만 잘리지 않는다
  const win = o.windowRect ?? null;

  // 길이(m) → 그 길이를 갖는 토막들. 키는 부동소수 비교를 피하려고 문자열로 접는다.
  const byHeight = new Map<string, { heightM: number; pieces: SlatPiece[] }>();
  const push = (column: number, u: number, yBottom: number, yTop: number): void => {
    const heightM = yTop - yBottom;
    if (heightM <= 1e-4) return; // 창문이 그 구간을 다 먹은 열
    const key = heightM.toFixed(5);
    const bucket = byHeight.get(key) ?? { heightM, pieces: [] };
    bucket.pieces.push({ column, u, centerY: yBottom + heightM / 2 });
    byHeight.set(key, bucket);
  };

  for (let i = 0; i < n; i++) {
    const u = first + i * o.pitchM;
    const crosses =
      win !== null && u + o.widthM / 2 > win.alongMinM && u - o.widthM / 2 < win.alongMaxM;
    if (crosses && win !== null) {
      push(i, u, o.bottomY, Math.min(o.topY, win.yMinM));
      push(i, u, Math.max(o.bottomY, win.yMaxM), o.topY);
    } else {
      push(i, u, o.bottomY, o.topY);
    }
  }

  const dummy = new THREE.Object3D();
  for (const bucket of byHeight.values()) {
    const geometry = new THREE.BoxGeometry(o.widthM, bucket.heightM, o.depthM);
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    const byColumn = new Map(bucket.pieces.map((p) => [p.column, p]));
    for (let i = 0; i < n; i++) {
      const piece = byColumn.get(i);
      // 자기 몫이 아닌 열은 **제자리에서** 접는다 — 원점에 두면 인스턴스 바운딩이 방 밖까지 늘어난다.
      poseOnWall(side, ctx, first + i * o.pitchM, piece?.centerY ?? o.bottomY, o.depthM / 2, dummy);
      dummy.scale.setScalar(piece ? 1 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    dummy.scale.setScalar(1);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
