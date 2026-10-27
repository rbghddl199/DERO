// 리그 매니페스트 저작 초안 — 세그먼트·관절을 불변 편집하고 product.ts 붙여넣기용 TS/JSON으로 직렬화하는 순수 로직 (react·three 임포트 없음)

import type { JointCoupling, JointKind, RigJoint, RigManifest } from '../scene/product';

/** three.Box3의 최소 형태 — core/는 three를 임포트하지 않으므로 배열 튜플로만 받는다. */
export interface Box3Lite {
  min: [number, number, number];
  max: [number, number, number];
}

/** 저작 중인 매니페스트. 구조는 RigManifest와 같지만 아직 검증 전 상태다. */
export interface RigDraft {
  segments: Record<string, string[]>;
  joints: RigJoint[];
  supportPart?: string;
  mountPart?: string;
}

/** 새 관절 기본값 — 회전축은 Y, 한계는 ±90도 (정지 포즈 0을 반드시 포함해야 한다). */
const DEFAULT_AXIS: [number, number, number] = [0, 1, 0];
const DEFAULT_MIN_DEG = -90;
const DEFAULT_MAX_DEG = 90;
/** prismatic 전환 기본 스트로크(mm) — 0을 포함해야 정지 포즈가 합법이다. */
const DEFAULT_MIN_MM = 0;
const DEFAULT_MAX_MM = 100;

type RawJoint = Record<string, unknown>;

const asRaw = (j: RigJoint): RawJoint => j as unknown as RawJoint;
const asJoint = (raw: RawJoint): RigJoint => raw as unknown as RigJoint;

function cloneJoint(j: RigJoint): RigJoint {
  const raw: RawJoint = { ...asRaw(j) };
  raw.axis = [...j.axis];
  raw.point = [...j.point];
  if (j.coupledTo) raw.coupledTo = { ...j.coupledTo };
  return asJoint(raw);
}

function cloneDraft(d: RigDraft): RigDraft {
  const segments: Record<string, string[]> = {};
  for (const [name, nodes] of Object.entries(d.segments)) segments[name] = [...nodes];
  const next: RigDraft = { segments, joints: d.joints.map(cloneJoint) };
  if (d.supportPart !== undefined) next.supportPart = d.supportPart;
  if (d.mountPart !== undefined) next.mountPart = d.mountPart;
  return next;
}

export function emptyDraft(): RigDraft {
  return { segments: {}, joints: [] };
}

/** 기존 매니페스트를 편집 가능한 초안으로 (깊은 복사 — 원본 배열을 공유하지 않는다). */
export function fromManifest(m: RigManifest): RigDraft {
  return cloneDraft(m);
}

/** 초안을 매니페스트로 (깊은 복사 — 초안을 계속 편집해도 결과가 흔들리지 않는다). */
export function toManifest(d: RigDraft): RigManifest {
  return cloneDraft(d);
}

// --- 세그먼트 ----------------------------------------------------------------

/** 세그먼트를 추가한다. 이미 있으면 노드 목록을 보존한다. */
export function addSegment(d: RigDraft, name: string): RigDraft {
  const next = cloneDraft(d);
  if (!next.segments[name]) next.segments[name] = [];
  return next;
}

/**
 * 세그먼트를 지우고, 그것을 parent·child로 참조하는 관절도 함께 지운다.
 * (조용히 남기면 validateManifest가 반려하는 초안이 만들어진다. 확인은 UI가 받는다.)
 * supportPart·mountPart가 그 세그먼트면 참조도 끊는다.
 */
export function removeSegment(d: RigDraft, name: string): RigDraft {
  const next = cloneDraft(d);
  delete next.segments[name];
  next.joints = next.joints.filter((j) => j.parent !== name && j.child !== name);
  if (next.supportPart === name) delete next.supportPart;
  if (next.mountPart === name) delete next.mountPart;
  return next;
}

/**
 * 노드를 한 세그먼트로 옮긴다. 노드는 한 세그먼트에만 속한다 —
 * 이전 소유 세그먼트에서 먼저 뺀다(중복 소유는 validateManifest가 반려한다).
 * `segment`가 null이면 어느 세그먼트에도 두지 않는다.
 */
export function assignPart(d: RigDraft, node: string, segment: string | null): RigDraft {
  const next = cloneDraft(d);
  for (const name of Object.keys(next.segments)) {
    next.segments[name] = next.segments[name].filter((n) => n !== node);
  }
  if (segment !== null) next.segments[segment] = [...(next.segments[segment] ?? []), node];
  return next;
}

// --- 피벗 --------------------------------------------------------------------

/**
 * 부모∩자식 bbox 교집합 상자의 중심을 기본 피벗으로 제안한다.
 * 축별로 `max(min_a, min_b) <= min(max_a, max_b)`면 그 축은 겹친다.
 * 세 축이 모두 겹치면 교집합 중심(separated=false), 한 축이라도 떨어지면
 * 두 bbox 중심의 중점(separated=true) — 후자는 추정이니 UI가 경고를 띄운다.
 */
export function defaultPivot(
  parent: Box3Lite,
  child: Box3Lite,
): { point: [number, number, number]; separated: boolean } {
  const intersection: [number, number, number] = [0, 0, 0];
  let separated = false;
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(parent.min[i], child.min[i]);
    const hi = Math.min(parent.max[i], child.max[i]);
    if (lo > hi) separated = true;
    intersection[i] = (lo + hi) / 2;
  }
  if (!separated) return { point: intersection, separated: false };

  const midpoint: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const parentCenter = (parent.min[i] + parent.max[i]) / 2;
    const childCenter = (child.min[i] + child.max[i]) / 2;
    midpoint[i] = (parentCenter + childCenter) / 2;
  }
  return { point: midpoint, separated: true };
}

// --- 관절 --------------------------------------------------------------------

export interface JointSeed {
  joint: string;
  label: string;
  parent: string;
  child: string;
}

/** 관절을 추가한다. 피벗은 두 세그먼트 bbox로 제안하고, 박스가 없으면 원점이다. */
export function addJoint(d: RigDraft, seed: JointSeed, boxes: Record<string, Box3Lite>): RigDraft {
  const parentBox = boxes[seed.parent];
  const childBox = boxes[seed.child];
  const point: [number, number, number] =
    parentBox && childBox ? defaultPivot(parentBox, childBox).point : [0, 0, 0];
  const next = cloneDraft(d);
  next.joints = [
    ...next.joints,
    {
      joint: seed.joint,
      label: seed.label,
      parent: seed.parent,
      child: seed.child,
      axis: [...DEFAULT_AXIS],
      point,
      minDeg: DEFAULT_MIN_DEG,
      maxDeg: DEFAULT_MAX_DEG,
    },
  ];
  return next;
}

/** 관절 필드를 덮어쓴다. 값이 undefined인 키는 객체에서 지운다(커플링 해제 등). */
export function updateJoint(d: RigDraft, id: string, patch: Partial<RigJoint>): RigDraft {
  const next = cloneDraft(d);
  next.joints = next.joints.map((j) => {
    if (j.joint !== id) return j;
    const raw: RawJoint = { ...asRaw(j) };
    for (const [key, value] of Object.entries(patch as RawJoint)) {
      if (value === undefined) delete raw[key];
      else raw[key] = value;
    }
    return asJoint(raw);
  });
  return next;
}

/**
 * 관절 종류를 바꾼다. **반대편 한계 필드를 객체에서 실제로 지운다** —
 * validateManifest는 금지 필드를 `!== undefined`로 들여다보므로 화면에서 숨기는 것만으로는
 * 반려된다 (rig.ts 124~142행, ADR-0002 결정 8-1). 기존 한계가 이미 그 종류의 것이면 보존한다.
 */
export function setJointKind(d: RigDraft, id: string, kind: JointKind): RigDraft {
  const next = cloneDraft(d);
  next.joints = next.joints.map((j) => {
    if (j.joint !== id) return j;
    const raw: RawJoint = { ...asRaw(j) };
    if (kind === 'prismatic') {
      const min = typeof raw.minMm === 'number' ? raw.minMm : DEFAULT_MIN_MM;
      const max = typeof raw.maxMm === 'number' ? raw.maxMm : DEFAULT_MAX_MM;
      delete raw.minDeg;
      delete raw.maxDeg;
      raw.kind = 'prismatic';
      raw.minMm = min;
      raw.maxMm = max;
    } else {
      const min = typeof raw.minDeg === 'number' ? raw.minDeg : DEFAULT_MIN_DEG;
      const max = typeof raw.maxDeg === 'number' ? raw.maxDeg : DEFAULT_MAX_DEG;
      delete raw.minMm;
      delete raw.maxMm;
      // 생략이 곧 revolute다 (ADR-0002 결정 1) — 기존 매니페스트 표기와 같아진다
      delete raw.kind;
      raw.minDeg = min;
      raw.maxDeg = max;
    }
    return asJoint(raw);
  });
  return next;
}

export function removeJoint(d: RigDraft, id: string): RigDraft {
  const next = cloneDraft(d);
  next.joints = next.joints.filter((j) => j.joint !== id);
  return next;
}

// --- 직렬화 ------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const objectKey = (k: string): string => (IDENTIFIER.test(k) ? k : quote(k));

/** 불필요한 0을 떨군 숫자 표기 (-0은 0으로). */
const num = (n: number): string => String(n === 0 ? 0 : n);

/** 좌표는 소수 4자리 반올림 — 저작 도구의 부동소수 잔재를 매니페스트에 흘리지 않는다. */
const coord = (n: number): string => num(Math.round(n * 1e4) / 1e4);

const vec = (v: [number, number, number]): string => `[${v.map(coord).join(', ')}]`;

const couplingLiteral = (c: JointCoupling): string => {
  const parts = [`joint: ${quote(c.joint)}`, `ratio: ${num(c.ratio)}`];
  if (c.offset !== undefined) parts.push(`offset: ${num(c.offset)}`);
  return `{ ${parts.join(', ')} }`;
};

function jointLiteral(j: RigJoint): string {
  const parts = [`joint: ${quote(j.joint)}`, `label: ${quote(j.label)}`];
  if (j.kind !== undefined) parts.push(`kind: ${quote(j.kind)}`);
  parts.push(`parent: ${quote(j.parent)}`, `child: ${quote(j.child)}`);
  parts.push(`axis: ${vec(j.axis)}`, `point: ${vec(j.point)}`);
  if (j.kind === 'prismatic') parts.push(`minMm: ${num(j.minMm)}`, `maxMm: ${num(j.maxMm)}`);
  else parts.push(`minDeg: ${num(j.minDeg)}`, `maxDeg: ${num(j.maxDeg)}`);
  if (j.coupledTo) parts.push(`coupledTo: ${couplingLiteral(j.coupledTo)}`);
  return `{ ${parts.join(', ')} }`;
}

/**
 * product.ts의 PRODUCTS 항목 안에 그대로 붙여넣는 `rig:` 블록 (들여쓰기 4칸 시작).
 * 관절 하나가 한 줄인 것은 **지금 product.ts의 실제 바이트를 따른 것**이다.
 * 주의: 이 줄들은 printWidth 100을 넘어 `prettier --write`를 돌리면 필드별로 펼쳐진다
 * (product.ts는 이미 format:check 실패 53개 파일 중 하나다). 붙여넣은 뒤 그 파일에
 * prettier를 돌리면 출력 포맷과 파일이 갈리므로, 회귀 기준선 테스트도 함께 깨진다.
 */
export function serializeTs(d: RigDraft): string {
  const lines: string[] = ['    rig: {'];
  if (d.supportPart !== undefined) lines.push(`      supportPart: ${quote(d.supportPart)},`);
  if (d.mountPart !== undefined) lines.push(`      mountPart: ${quote(d.mountPart)},`);

  const segments = Object.entries(d.segments);
  if (segments.length === 0) {
    lines.push('      segments: {},');
  } else {
    lines.push('      segments: {');
    for (const [name, nodes] of segments) {
      lines.push(`        ${objectKey(name)}: [${nodes.map(quote).join(', ')}],`);
    }
    lines.push('      },');
  }

  if (d.joints.length === 0) {
    lines.push('      joints: [],');
  } else {
    lines.push('      joints: [');
    for (const j of d.joints) lines.push(`        ${jointLiteral(j)},`);
    lines.push('      ],');
  }

  lines.push('    },');
  return lines.join('\n');
}

/** 에셋 파이프라인·검수용 JSON. */
export function serializeJson(d: RigDraft): string {
  return JSON.stringify(toManifest(d), null, 2);
}
