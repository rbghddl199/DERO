// 조명 GLB 저작 판정 — light_origin 노드 → mm 변환, lampShade 갓 차단각 게이트, 누락 경고 (docs/context/asset-pipeline.md "조명 GLB 저작 규약")
//
// three 런타임 임포트가 없다(타입만) — assetLoader.ts와 같은 규약으로 node-env vitest에서
// 씬그래프를 조립해 그대로 검증한다. Object3D/Mesh는 메서드·필드만 덕타이핑으로 쓴다.

import type { Mesh, Object3D } from 'three';

/** 광원 좌표를 나르는 빈 노드 이름. 정확히 이 이름만 인정한다(이름 변경 = 파괴적 변경). */
export const LIGHT_ORIGIN_NODE_NAME = 'light_origin';

/** 차폐 기하(갓) 메쉬 이름. `render/cookieBake.ts`가 이 이름으로 굽는 것과 같은 술어여야
 *  도구가 "굽힐 것"과 "쟀다고 말하는 것"이 갈리지 않는다 — 그래서 정의가 여기 하나다. */
export const SHADE_MESH_NAME = 'lampShade';

/** 기운 갓의 차단각 범위를 훑을 방위 표본 수. 절차 램프 갓(정점 28개)에서 16.7°~24.4°를 재현한다. */
export const AZIMUTH_BIN_COUNT = 32;

/** 미터 단위 제품 로컬 좌표 */
export interface Vec3M {
  x: number;
  y: number;
  z: number;
}

/** `product_emitter`에 그대로 넣는 mm 정수 (컬럼명 그대로 — 복사해 붙일 값이다) */
export interface PointMm {
  point_x_mm: number;
  point_y_mm: number;
  point_z_mm: number;
}

export interface ShadeGate {
  /** 표본에 들어간 lampShade 메쉬 수 */
  meshCount: number;
  /** light_origin보다 아래에 있어 차단각을 만든 표본 수 */
  sampledPoints: number;
  /** 표본이 잡힌 방위 빈 수 (최대 AZIMUTH_BIN_COUNT) */
  sampledBins: number;
  /** 대표 갓 아랫테 반경(m) — 방위별 아랫테 점의 평균 수평 거리.
   *  기운 갓에서는 다각형 근사만큼 실제 반경보다 ~1% 작게 나온다(안 기운 갓은 정확하다). */
  rBotM: number;
  /** light_origin에서 갓 아랫테까지의 평균 깊이(m) */
  depthM: number;
  /** atan(rBot / H) — 갓이 안 기울었다고 본 단일 근사(rad). **판정 정본은 아래 min~max 범위다.** */
  blockAngleRad: number;
  /** 방위별 차단 시작각의 최소(rad) — 갓이 기운 쪽 */
  minBlockAngleRad: number;
  /** 방위별 차단 시작각의 최대(rad) */
  maxBlockAngleRad: number;
}

export interface LightAssetAnalysis {
  /** `light_origin` 이름을 가진 노드 수. 0이면 bbox 중심 폴백이 걸린다 */
  originNodeCount: number;
  /** 규약대로 메쉬·자식 없는 Empty인가 (노드가 없으면 false) */
  originIsEmpty: boolean;
  /** 제품 로컬 좌표(m). 노드가 없으면 null */
  originM: Vec3M | null;
  /** 위 좌표의 mm 정수. 노드가 없으면 null */
  pointMm: PointMm | null;
  /** `lampShade` 메쉬 수 */
  shadeMeshCount: number;
  /** 갓 게이트. 갓이 없거나 광원 아래에 갓 정점이 없으면 null */
  gate: ShadeGate | null;
}

/** 갓이 빔을 실제로 깎는지 — 전 방위(blocks) / 일부 방위만(partial) / 전혀(none) */
export type ShadeVerdict = 'blocks' | 'partial' | 'none';

export type IssueLevel = 'info' | 'warn' | 'error';

export interface AuthoringIssue {
  level: IssueLevel;
  message: string;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function deg(rad: number): string {
  return `${radToDeg(rad).toFixed(1)}°`;
}

/** 이름이 정확히 일치하는 노드를 GLB 루트 아래에서 전부 모은다. */
function collectByName(root: Object3D, name: string): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (node.name === name) found.push(node);
  });
  return found;
}

/** `lampShade` 메쉬 — `cookieBake.renderMask()`와 같은 술어(이름 정확 일치 + isMesh). */
export function collectShadeMeshes(root: Object3D): Mesh[] {
  return collectByName(root, SHADE_MESH_NAME).filter((n): n is Mesh => (n as Mesh).isMesh === true);
}

/** 미터 → `product_emitter.point_*_mm` 정수. `-0`은 0으로 눕힌다(DB에 넣을 정수다). */
function roundMm(m: number): number {
  const v = Math.round(m * 1000);
  return v === 0 ? 0 : v;
}

/** 미터 → `product_emitter.point_*_mm` 정수. */
export function toPointMm(p: Vec3M): PointMm {
  return {
    point_x_mm: roundMm(p.x),
    point_y_mm: roundMm(p.y),
    point_z_mm: roundMm(p.z),
  };
}

/** 월드 행렬(= 루트가 항등이므로 제품 로컬)로 정점 하나를 옮긴다. column-major. */
function applyMatrix(e: ArrayLike<number>, x: number, y: number, z: number): Vec3M {
  return {
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    z: e[2] * x + e[6] * y + e[10] * z + e[14],
  };
}

/** 광원 기준 극좌표. 광원보다 위(깊이 ≤ 0)인 점은 아래로 나가는 빛을 못 가리므로 null이다. */
interface PolarSample {
  /** 아래(−Y) 축에서 잰 각 — 곧 차단 시작각 후보 */
  theta: number;
  /** 수평 거리(m) */
  r: number;
  /** 광원에서 내려온 깊이(m) */
  depth: number;
  azimuth: number;
}

function polarOf(p: Vec3M, o: Vec3M): PolarSample | null {
  const depth = o.y - p.y;
  if (depth <= 0) return null;
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const r = Math.hypot(dx, dz);
  return { theta: Math.atan2(r, depth), r, depth, azimuth: Math.atan2(dz, dx) };
}

function binOf(azimuth: number): number {
  const t = (azimuth + Math.PI) / (2 * Math.PI);
  return Math.min(AZIMUTH_BIN_COUNT - 1, Math.max(0, Math.floor(t * AZIMUTH_BIN_COUNT)));
}

/**
 * 갓 차단 게이트. 광원에서 아래(−Y)를 향한 광선이 갓에 처음 닿기 시작하는 각을 방위별로 잰다.
 *
 * 원리: 갓 표면의 점 P에 대해 `θ = atan(수평거리 / 깊이)`는 아랫테에서 최소가 된다(원통·원뿔
 * 모두 위로 갈수록 깊이가 얕아져 θ가 커진다). 그래서 **방위별 최소 θ**가 곧 그 방위의 아랫테
 * 각이고, 아랫테를 따로 찾아낼 필요가 없다 — 갓이 기울어도 그대로 성립한다.
 *
 * **정점만 세면 안 된다.** 방위 빈이 아랫테 정점보다 촘촘하면 아랫테가 안 잡힌 빈이 생기고,
 * 기운 갓에서는 그 자리를 **광원 아래로 내려온 갓 윗테**가 대신 채워 차단각이 85°로 튄다
 * (실측: rotation.z=0.12 램프에서 최대 24.4°여야 할 값이 85.6°). 그래서 삼각형 **변**을 따라
 * 그 변이 지나는 방위 빈을 전부 채운다 — 값은 양 끝 정점의 θ를 선형 보간해 쓰므로 면을 잘게
 * 쪼갠 표본과 달리 현(chord) 편향이 없다(안 기운 갓은 전 방위가 정확히 한 값으로 모인다).
 *
 * 호출 전에 `root.updateMatrixWorld(true)`가 돌아야 하고 루트는 항등이어야 한다
 * (그래야 `matrixWorld`가 곧 제품 로컬 좌표다 — 이 도구는 GLB 루트를 절대 변형하지 않는다).
 */
export function computeShadeGate(shades: Mesh[], originM: Vec3M): ShadeGate | null {
  const minTheta = new Array<number>(AZIMUTH_BIN_COUNT).fill(Infinity);
  const rimR = new Array<number>(AZIMUTH_BIN_COUNT).fill(0);
  const rimDepth = new Array<number>(AZIMUTH_BIN_COUNT).fill(0);
  const binWidth = (2 * Math.PI) / AZIMUTH_BIN_COUNT;
  let sampledPoints = 0;

  const record = (azimuth: number, theta: number, r: number, depth: number): void => {
    sampledPoints++;
    const bin = binOf(azimuth);
    if (theta >= minTheta[bin]) return;
    minTheta[bin] = theta;
    rimR[bin] = r;
    rimDepth[bin] = depth;
  };

  const recordEdge = (a: PolarSample | null, b: PolarSample | null): void => {
    // 한쪽이 광원 위면 변이 지평선을 가로지른다 — 방위를 늘리지 말고 유효한 끝점만 남긴다.
    if (!a || !b) {
      const one = a ?? b;
      if (one) record(one.azimuth, one.theta, one.r, one.depth);
      return;
    }
    let span = b.azimuth - a.azimuth;
    if (span > Math.PI) span -= 2 * Math.PI;
    if (span < -Math.PI) span += 2 * Math.PI;
    // 빈 반 칸보다 촘촘히 걸어야 사이 빈이 비지 않는다.
    const steps = Math.max(1, Math.ceil((Math.abs(span) / binWidth) * 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      record(
        a.azimuth + span * t,
        a.theta + (b.theta - a.theta) * t,
        a.r + (b.r - a.r) * t,
        a.depth + (b.depth - a.depth) * t,
      );
    }
  };

  for (const mesh of shades) {
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    const index = mesh.geometry.getIndex();
    const e = mesh.matrixWorld.elements;
    const at = (i: number): PolarSample | null =>
      polarOf(applyMatrix(e, position.getX(i), position.getY(i), position.getZ(i)), originM);
    const count = index ? index.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = at(index ? index.getX(t) : t);
      const b = at(index ? index.getX(t + 1) : t + 1);
      const c = at(index ? index.getX(t + 2) : t + 2);
      recordEdge(a, b);
      recordEdge(b, c);
      recordEdge(c, a);
    }
  }

  const bins: number[] = [];
  for (let b = 0; b < AZIMUTH_BIN_COUNT; b++) {
    if (Number.isFinite(minTheta[b])) bins.push(b);
  }
  if (bins.length === 0) return null;

  const rBotM = bins.reduce((s, b) => s + rimR[b], 0) / bins.length;
  const depthM = bins.reduce((s, b) => s + rimDepth[b], 0) / bins.length;

  return {
    meshCount: shades.length,
    sampledPoints,
    sampledBins: bins.length,
    rBotM,
    depthM,
    blockAngleRad: Math.atan2(rBotM, depthM),
    minBlockAngleRad: Math.min(...bins.map((b) => minTheta[b])),
    maxBlockAngleRad: Math.max(...bins.map((b) => minTheta[b])),
  };
}

/**
 * GLB 루트 하나를 훑어 등록에 필요한 값을 전부 뽑는다. 루트는 변형되지 않은 상태여야 한다
 * (제품 로컬 좌표 = 월드 좌표). 여기서 `updateMatrixWorld`를 직접 돌린다.
 */
export function analyzeLightAsset(root: Object3D): LightAssetAnalysis {
  root.updateMatrixWorld(true);

  const originNodes = collectByName(root, LIGHT_ORIGIN_NODE_NAME);
  const origin = originNodes[0] ?? null;
  const originM = origin ? applyMatrix(origin.matrixWorld.elements, 0, 0, 0) : null;
  const shades = collectShadeMeshes(root);

  return {
    originNodeCount: originNodes.length,
    originIsEmpty: origin
      ? (origin as Mesh).isMesh !== true && origin.children.length === 0
      : false,
    originM,
    pointMm: originM ? toPointMm(originM) : null,
    shadeMeshCount: shades.length,
    gate: originM ? computeShadeGate(shades, originM) : null,
  };
}

/** 차단각 ≥ 빔 반각이면 그 방위는 무늬를 못 낸다. 기운 갓은 방위마다 갈리므로 3값이다. */
export function judgeShadeGate(gate: ShadeGate, beamHalfAngleRad: number): ShadeVerdict {
  if (gate.maxBlockAngleRad < beamHalfAngleRad) return 'blocks';
  if (gate.minBlockAngleRad < beamHalfAngleRad) return 'partial';
  return 'none';
}

/**
 * 저작 경고 목록. **어느 항목도 등록을 막지 않는다** (228 결정 ③) — 얕은 접시형 갓·오픈
 * 셰이드는 실물에 있고 그런 제품은 무늬가 없는 것이 사실이다.
 */
export function reviewLightAsset(
  analysis: LightAssetAnalysis,
  beamHalfAngleRad: number,
): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const { originNodeCount, originIsEmpty, shadeMeshCount, gate } = analysis;

  if (originNodeCount === 0) {
    issues.push(
      shadeMeshCount > 0
        ? {
            level: 'error',
            message:
              `\`${LIGHT_ORIGIN_NODE_NAME}\` 노드가 없는데 차폐 기하(\`${SHADE_MESH_NAME}\`)는 ${shadeMeshCount}개다 — ` +
              '차폐 기하가 있으면 이 노드는 필수다. 이대로 등록하면 런타임이 bbox 중심으로 폴백하는데 ' +
              '램프의 bbox 중심은 폴대 중간이라 광원이 조용히 틀린다.',
          }
        : {
            level: 'warn',
            message:
              `\`${LIGHT_ORIGIN_NODE_NAME}\` 노드가 없다 — bbox 중심 폴백이 걸린다. ` +
              '모니터라이트·스크린바처럼 제품 전체가 발광 바인 제품은 bbox 중심이 맞으니 이대로 등록해도 된다.',
          },
    );
  } else {
    if (originNodeCount > 1) {
      issues.push({
        level: 'error',
        message: `\`${LIGHT_ORIGIN_NODE_NAME}\` 노드가 ${originNodeCount}개다 — 첫 번째 노드로 계산했다. 정확히 하나여야 한다.`,
      });
    }
    if (!originIsEmpty) {
      issues.push({
        level: 'warn',
        message: `\`${LIGHT_ORIGIN_NODE_NAME}\`에 메쉬 또는 자식이 붙어 있다 — 규약은 메쉬·자식 없는 Empty다. 위치는 그대로 읽었다.`,
      });
    }
  }

  if (shadeMeshCount === 0) {
    issues.push({
      level: 'info',
      message: `\`${SHADE_MESH_NAME}\` 메쉬가 없다 — 쿠키 마스크가 흰색(차폐 없음)으로 정상 렌더된다.`,
    });
  } else if (!gate) {
    issues.push({
      level: 'warn',
      message: `\`${SHADE_MESH_NAME}\` 메쉬는 있지만 \`${LIGHT_ORIGIN_NODE_NAME}\`보다 아래에 갓 정점이 없다 — 차단각을 계산할 수 없다. 광원이 갓 안쪽 위에 있는지 확인하라.`,
    });
  } else {
    const range = `${deg(gate.minBlockAngleRad)}~${deg(gate.maxBlockAngleRad)}`;
    const beam = deg(beamHalfAngleRad);
    switch (judgeShadeGate(gate, beamHalfAngleRad)) {
      case 'none':
        issues.push({
          level: 'warn',
          message:
            `이 갓은 무늬를 내지 않는다 — 차단 시작각 ${range}가 전 방위에서 빔 반각 ${beam} 이상이라 빛이 갓을 스치지 않는다. ` +
            '얕은 접시형·오픈 셰이드는 실물에 있으므로 등록은 막지 않는다.',
        });
        break;
      case 'partial':
        issues.push({
          level: 'warn',
          message:
            `무늬가 빔 바깥 테두리에만 생긴다 — 갓이 기울어 차단 시작각이 방위마다 ${range}로 갈리고 그중 일부만 빔 반각 ${beam} 안에 든다. ` +
            '등록은 막지 않는다.',
        });
        break;
      case 'blocks':
        issues.push({
          level: 'info',
          message: `갓이 빔을 깎는다 — 전 방위 차단 시작각 ${range} < 빔 반각 ${beam}.`,
        });
        break;
    }
  }

  return issues;
}
