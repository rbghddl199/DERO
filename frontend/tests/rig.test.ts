import { describe, it, expect } from 'vitest';
import {
  jointParentIndex,
  segmentPivotIndex,
  jointKind,
  jointLimits,
  clampJoint,
  isDriver,
  resolveJointValues,
  validateManifest,
} from '../src/three/core/rig';
import { getProduct, type RigJoint, type RigManifest } from '../src/three/scene/product';

const arm = getProduct('monitor-arm-white')!;
const rig = arm.rig!;

describe('monitor-arm rig manifest (spec DB, D16)', () => {
  it('exists with 5 segments and 5 joints', () => {
    expect(Object.keys(rig.segments)).toHaveLength(5);
    expect(rig.joints).toHaveLength(5);
  });

  it('every joint references defined segments, has a label and a valid limit range', () => {
    for (const j of rig.joints) {
      expect(rig.segments[j.parent]).toBeDefined();
      expect(rig.segments[j.child]).toBeDefined();
      expect(j.label.length).toBeGreaterThan(0);
      const { min, max } = jointLimits(j);
      expect(min).toBeLessThan(max);
      expect(min).toBeLessThanOrEqual(0);
      expect(max).toBeGreaterThanOrEqual(0); // rest pose 0 must be legal
      expect(Math.hypot(...j.axis)).toBeCloseTo(1, 5);
    }
  });

  it('segment node names are unique across segments', () => {
    const names = Object.values(rig.segments).flat();
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('FK chain resolution', () => {
  it('nests pivots base-yaw -> elbow-pitch -> head-tilt -> head-swivel -> head-pivot', () => {
    expect(jointParentIndex(rig.joints, 0)).toBe(-1); // root
    expect(jointParentIndex(rig.joints, 1)).toBe(0);
    expect(jointParentIndex(rig.joints, 2)).toBe(1);
    expect(jointParentIndex(rig.joints, 3)).toBe(2);
    expect(jointParentIndex(rig.joints, 4)).toBe(3); // head-pivot stacked with head-swivel
  });

  it('attaches each segment to its deepest pivot (root segment -> -1)', () => {
    expect(segmentPivotIndex(rig.joints, 'clamp-base')).toBe(-1);
    expect(segmentPivotIndex(rig.joints, 'arm-lower')).toBe(0);
    expect(segmentPivotIndex(rig.joints, 'arm-upper')).toBe(1);
    expect(segmentPivotIndex(rig.joints, 'head-bracket')).toBe(2);
    expect(segmentPivotIndex(rig.joints, 'head-mount')).toBe(4);
  });
});

describe('joint kind discrimination (ADR-0002 결정 1)', () => {
  const revolute: RigJoint = {
    joint: 'r',
    label: '회전',
    parent: 'a',
    child: 'b',
    axis: [0, 1, 0],
    point: [0, 0, 0],
    minDeg: -35,
    maxDeg: 35,
  };
  const prismatic: RigJoint = {
    joint: 'p',
    label: '승강',
    kind: 'prismatic',
    parent: 'a',
    child: 'b',
    axis: [0, 1, 0],
    point: [0, 0, 0],
    minMm: 0,
    maxMm: 120,
  };

  it('defaults a manifest without `kind` to revolute', () => {
    expect(jointKind(revolute)).toBe('revolute');
    expect(jointKind(prismatic)).toBe('prismatic');
    // 기존 매니페스트(kind 없음)는 전부 revolute여야 한다
    for (const j of rig.joints) expect(jointKind(j)).toBe('revolute');
  });

  it('reads limits from the fields the kind owns', () => {
    expect(jointLimits(revolute)).toEqual({ min: -35, max: 35 });
    expect(jointLimits(prismatic)).toEqual({ min: 0, max: 120 });
  });

  it('clamps into the kind-specific range', () => {
    expect(clampJoint(revolute, 10)).toBe(10);
    expect(clampJoint(revolute, 999)).toBe(35);
    expect(clampJoint(revolute, -999)).toBe(-35);
    expect(clampJoint(prismatic, 60)).toBe(60);
    expect(clampJoint(prismatic, 999)).toBe(120);
    expect(clampJoint(prismatic, -5)).toBe(0);
  });
});

describe('coupling — dependent joints (ADR-0002 결정 2)', () => {
  const joints: RigJoint[] = [
    {
      joint: 'boom-pitch',
      label: '붐 각도',
      parent: 'base',
      child: 'boom',
      axis: [1, 0, 0],
      point: [0, 0.1, 0],
      minDeg: -45,
      maxDeg: 45,
    },
    {
      joint: 'boom-parallel',
      label: '평행 유지',
      parent: 'boom',
      child: 'head',
      axis: [1, 0, 0],
      point: [0, 0.3, 0],
      minDeg: -45,
      maxDeg: 45,
      coupledTo: { joint: 'boom-pitch', ratio: -1 },
    },
  ];

  it('marks only non-coupled joints as drivers', () => {
    expect(isDriver(joints[0])).toBe(true);
    expect(isDriver(joints[1])).toBe(false);
  });

  it('derives the dependent value as driver * ratio + offset', () => {
    const v = resolveJointValues(joints, { 'boom-pitch': 30 });
    expect(v.get('boom-pitch')).toBe(30);
    expect(v.get('boom-parallel')).toBe(-30);
  });

  it('applies the offset when present', () => {
    const withOffset: RigJoint[] = [
      joints[0],
      { ...joints[1], coupledTo: { joint: 'boom-pitch', ratio: -1, offset: 5 } },
    ];
    expect(resolveJointValues(withOffset, { 'boom-pitch': 30 }).get('boom-parallel')).toBe(-25);
  });

  it('re-clamps the dependent to ITS OWN limits (bad ratio must not flip a part)', () => {
    const badRatio: RigJoint[] = [
      joints[0],
      { ...joints[1], coupledTo: { joint: 'boom-pitch', ratio: -10 } },
    ];
    // driver 30 * -10 = -300 -> 자기 한계 -45로 다시 잘린다
    expect(resolveJointValues(badRatio, { 'boom-pitch': 30 }).get('boom-parallel')).toBe(-45);
  });

  it('clamps the driver before deriving, and defaults a missing driver value to 0', () => {
    expect(resolveJointValues(joints, { 'boom-pitch': 999 }).get('boom-parallel')).toBe(-45);
    expect(resolveJointValues(joints, {}).get('boom-parallel')).toBe(0);
  });

  it('rest pose ({}) reflects offset — offset≠0 dependents must not sit at 0 until driven (코드리뷰 지적)', () => {
    const withOffset: RigJoint[] = [
      joints[0],
      { ...joints[1], coupledTo: { joint: 'boom-pitch', ratio: -1, offset: 5 } },
    ];
    // driver 기본값 0 -> coupled = 0*-1 + 5 = 5 (productAssets.buildArticulation이
    // 이 맵으로 정지 포즈 피벗을 시딩한다)
    expect(resolveJointValues(withOffset, {}).get('boom-parallel')).toBe(5);
  });
});

describe('validateManifest (ADR-0002 결정 8-1 기계 판정)', () => {
  const ok: RigManifest = {
    segments: { base: ['mesh_0'], arm: ['mesh_1'] },
    joints: [
      {
        joint: 'lift',
        label: '승강',
        kind: 'prismatic',
        parent: 'base',
        child: 'arm',
        axis: [0, 1, 0],
        point: [0, 0, 0],
        minMm: 0,
        maxMm: 120,
      },
    ],
  };

  it('passes a well-formed manifest', () => {
    expect(validateManifest(ok)).toEqual([]);
  });

  it('passes the shipped monitor-arm manifest', () => {
    expect(validateManifest(rig)).toEqual([]);
  });

  it('rejects a prismatic joint carrying revolute limits', () => {
    const bad = {
      ...ok,
      joints: [{ ...ok.joints[0], minDeg: -10, maxDeg: 10 } as unknown as RigJoint],
    };
    expect(validateManifest(bad)).toContain(
      "joint 'lift': prismatic requires minMm/maxMm, got minDeg",
    );
  });

  it('rejects a revolute joint carrying prismatic limits', () => {
    const bad: RigManifest = {
      ...ok,
      joints: [
        {
          joint: 'tilt',
          label: '틸트',
          parent: 'base',
          child: 'arm',
          axis: [0, 1, 0],
          point: [0, 0, 0],
          minMm: 0,
          maxMm: 10,
        } as unknown as RigJoint,
      ],
    };
    expect(validateManifest(bad)).toContain(
      "joint 'tilt': revolute requires minDeg/maxDeg, got minMm",
    );
  });

  it('rejects an empty label, an unknown segment, a non-unit axis and a bad range', () => {
    const bad: RigManifest = {
      segments: { base: ['mesh_0'] },
      joints: [
        {
          joint: 'x',
          label: '',
          parent: 'base',
          child: 'nope',
          axis: [0, 2, 0],
          point: [0, 0, 0],
          minDeg: 10,
          maxDeg: -10,
        },
      ],
    };
    const errs = validateManifest(bad);
    expect(errs).toContain("joint 'x': label must not be empty");
    expect(errs).toContain("joint 'x': child segment 'nope' is not defined in segments");
    expect(errs).toContain("joint 'x': axis must be a unit vector, got length 2.000");
    expect(errs).toContain("joint 'x': minDeg 10 must be < maxDeg -10");
  });

  it('rejects a rest pose outside the limit range', () => {
    const bad: RigManifest = {
      ...ok,
      joints: [{ ...ok.joints[0], minMm: 10, maxMm: 120 }],
    };
    expect(validateManifest(bad)).toContain("joint 'lift': rest pose 0 must be inside [10, 120]");
  });

  it('rejects duplicate joint ids and duplicate segment node names', () => {
    const bad: RigManifest = {
      segments: { base: ['mesh_0'], arm: ['mesh_0'] },
      joints: [
        {
          joint: 'a',
          label: '가',
          parent: 'base',
          child: 'arm',
          axis: [0, 1, 0],
          point: [0, 0, 0],
          minDeg: -1,
          maxDeg: 1,
        },
        {
          joint: 'a',
          label: '가',
          parent: 'base',
          child: 'arm',
          axis: [0, 1, 0],
          point: [0, 0, 0],
          minDeg: -1,
          maxDeg: 1,
        },
      ],
    };
    const errs = validateManifest(bad);
    expect(errs).toContain("joint 'a': duplicate joint id");
    expect(errs).toContain("segment node name 'mesh_0' is used by more than one segment");
  });

  it('rejects a coupling to an unknown, self, or already-coupled joint (chain ban)', () => {
    const base: RigJoint = {
      joint: 'a',
      label: '가',
      parent: 'base',
      child: 'arm',
      axis: [0, 1, 0],
      point: [0, 0, 0],
      minDeg: -1,
      maxDeg: 1,
    };
    const segments = { base: ['mesh_0'], arm: ['mesh_1'] };

    expect(
      validateManifest({
        segments,
        joints: [{ ...base, coupledTo: { joint: 'ghost', ratio: 1 } }],
      }),
    ).toContain("joint 'a': coupledTo.joint 'ghost' does not exist");

    expect(
      validateManifest({ segments, joints: [{ ...base, coupledTo: { joint: 'a', ratio: 1 } }] }),
    ).toContain("joint 'a': coupledTo.joint must not be itself");

    const chain: RigJoint[] = [
      base,
      { ...base, joint: 'b', coupledTo: { joint: 'a', ratio: 1 } },
      { ...base, joint: 'c', coupledTo: { joint: 'b', ratio: 1 } },
    ];
    expect(validateManifest({ segments, joints: chain })).toContain(
      "joint 'c': coupledTo.joint 'b' is itself coupled — chained coupling is not allowed",
    );
  });
});
