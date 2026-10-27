// RigManifest 기반 순수 FK 리그 체인 수학 — three 임포트 없음(node 환경 유닛테스트), 관절의 부모-자식 관계·세그먼트 배치·종류별 클램프를 계산

import type { JointKind, RigJoint, RigManifest } from '../scene/product';

/**
 * Index of the pivot that joint `i` nests under, or -1 for the rig root.
 * Rule: nearest earlier joint whose child is this joint's parent segment —
 * or (stacked joints at one pivot, e.g. base-yaw + shoulder-pitch) whose
 * child is the SAME segment as this joint's child.
 */
export function jointParentIndex(joints: RigJoint[], i: number): number {
  const j = joints[i];
  for (let k = i - 1; k >= 0; k--) {
    if (joints[k].child === j.parent || joints[k].child === j.child) return k;
  }
  return -1;
}

/**
 * Index of the deepest pivot a segment's meshes attach to (last joint whose
 * child is the segment), or -1 when the segment stays on the rig root.
 */
export function segmentPivotIndex(joints: RigJoint[], segment: string): number {
  for (let k = joints.length - 1; k >= 0; k--) {
    if (joints[k].child === segment) return k;
  }
  return -1;
}

/** 생략된 `kind`는 revolute다 (다수 쪽이 기본값 — ADR-0002 결정 1). */
export function jointKind(j: RigJoint): JointKind {
  return j.kind === 'prismatic' ? 'prismatic' : 'revolute';
}

/** 종류가 소유한 필드에서 한계를 읽는다 (revolute=도, prismatic=mm). */
export function jointLimits(j: RigJoint): { min: number; max: number } {
  return j.kind === 'prismatic' ? { min: j.minMm, max: j.maxMm } : { min: j.minDeg, max: j.maxDeg };
}

/** Clamp a requested joint value into the spec-DB limit range of its kind. */
export function clampJoint(j: RigJoint, value: number): number {
  const { min, max } = jointLimits(j);
  return Math.max(min, Math.min(max, value));
}

/** 종속 관절이 아니면 driver — 사용자가 만지는 것은 driver뿐이다. */
export function isDriver(j: RigJoint): boolean {
  return !j.coupledTo;
}

/**
 * 종속 관절의 값 = driver × ratio + offset, 계산 후 자기 한계로 재클램프.
 * `resolveJointValues`(로드 경로)와 `scene.articulate`(조작 경로)가 **이 함수를 공유**한다 —
 * 두 곳에 같은 산술을 복사하면 한쪽만 고치는 날 포즈가 갈린다.
 */
export function coupledValue(dependent: RigJoint, driverValue: number): number {
  const c = dependent.coupledTo;
  if (!c) return clampJoint(dependent, driverValue);
  return clampJoint(dependent, driverValue * c.ratio + (c.offset ?? 0));
}

/**
 * driver 값 맵을 받아 **모든** 관절의 적용값을 계산한다.
 * 종속값 = driver × ratio + offset 이고, 계산 후 자기 한계로 다시 클램프한다
 * (ratio 오입력 시 파트 뒤집힘 방지 — ADR-0002 결정 2).
 * 저장되는 것은 driver 값뿐이며 종속값은 로드 시 여기서 재계산된다.
 */
export function resolveJointValues(
  joints: RigJoint[],
  driverValues: Record<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const j of joints) {
    if (!isDriver(j)) continue;
    out.set(j.joint, clampJoint(j, driverValues[j.joint] ?? 0));
  }
  for (const j of joints) {
    const c = j.coupledTo;
    if (!c) continue;
    out.set(j.joint, coupledValue(j, out.get(c.joint) ?? 0));
  }
  return out;
}

/**
 * 손저작 JSON은 타입이 안 오므로 기계가 판정한다 (ADR-0002 결정 8-1).
 * 반환값이 빈 배열이면 통과. 위반은 관절 id를 박은 한 줄씩으로 돌려준다.
 */
export function validateManifest(rig: RigManifest): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const nodeOwners = new Map<string, string>();

  for (const [segment, nodes] of Object.entries(rig.segments)) {
    for (const node of nodes) {
      const owner = nodeOwners.get(node);
      if (owner && owner !== segment) {
        errors.push(`segment node name '${node}' is used by more than one segment`);
      }
      nodeOwners.set(node, segment);
    }
  }

  const coupledIds = new Set(rig.joints.filter((j) => j.coupledTo).map((j) => j.joint));

  for (const j of rig.joints) {
    const at = `joint '${j.joint}'`;
    if (ids.has(j.joint)) errors.push(`${at}: duplicate joint id`);
    ids.add(j.joint);

    if (!j.label || j.label.trim().length === 0) errors.push(`${at}: label must not be empty`);
    if (!rig.segments[j.parent]) {
      errors.push(`${at}: parent segment '${j.parent}' is not defined in segments`);
    }
    if (!rig.segments[j.child]) {
      errors.push(`${at}: child segment '${j.child}' is not defined in segments`);
    }

    const axisLen = Math.hypot(...j.axis);
    if (Math.abs(axisLen - 1) > 1e-3) {
      errors.push(`${at}: axis must be a unit vector, got length ${axisLen.toFixed(3)}`);
    }

    // 손저작 JSON은 타입이 안 오므로 "금지 필드"를 실제로 들여다본다
    const raw = j as unknown as Record<string, unknown>;
    const kind = jointKind(j);
    const [need, banned] =
      kind === 'prismatic'
        ? [
            ['minMm', 'maxMm'],
            ['minDeg', 'maxDeg'],
          ]
        : [
            ['minDeg', 'maxDeg'],
            ['minMm', 'maxMm'],
          ];
    const missing = need.filter((f) => typeof raw[f] !== 'number');
    const present = banned.filter((f) => raw[f] !== undefined);
    if (missing.length > 0 || present.length > 0) {
      const got = present.length > 0 ? present[0] : 'nothing';
      errors.push(`${at}: ${kind} requires ${need.join('/')}, got ${got}`);
    }
    if (missing.length === 0) {
      const { min, max } = jointLimits(j);
      const [minName, maxName] = need;
      if (!(min < max)) errors.push(`${at}: ${minName} ${min} must be < ${maxName} ${max}`);
      else if (min > 0 || max < 0) {
        errors.push(`${at}: rest pose 0 must be inside [${min}, ${max}]`);
      }
    }

    const c = j.coupledTo;
    if (c) {
      if (c.joint === j.joint) errors.push(`${at}: coupledTo.joint must not be itself`);
      else if (!ids.has(c.joint) && !rig.joints.some((o) => o.joint === c.joint)) {
        errors.push(`${at}: coupledTo.joint '${c.joint}' does not exist`);
      } else if (coupledIds.has(c.joint)) {
        errors.push(
          `${at}: coupledTo.joint '${c.joint}' is itself coupled — chained coupling is not allowed`,
        );
      }
      if (!Number.isFinite(c.ratio)) errors.push(`${at}: coupledTo.ratio must be a finite number`);
    }
  }
  return errors;
}
