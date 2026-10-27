// 리그 매니페스트 저작 초안(rigDraft) 순수 로직 테스트 — 불변 편집·기본 피벗·종류 전환·직렬화 포맷 회귀
import { describe, it, expect } from 'vitest';
import {
  emptyDraft,
  fromManifest,
  toManifest,
  addSegment,
  removeSegment,
  assignPart,
  defaultPivot,
  addJoint,
  updateJoint,
  setJointKind,
  removeJoint,
  serializeTs,
  serializeJson,
  type Box3Lite,
  type RigDraft,
} from '../src/three/core/rigDraft';
import { validateManifest, jointKind } from '../src/three/core/rig';
import { getProduct, type RigJoint } from '../src/three/scene/product';

const arm = getProduct('monitor-arm-white')!;
const armRig = arm.rig!;

/** monitor-arm 매니페스트를 그대로 재출력한 문자열 — product.ts 278~294행과 바이트 동일해야 한다. */
const ARM_TS = [
  '    rig: {',
  "      supportPart: 'clamp-base',",
  "      mountPart: 'head-mount',",
  '      segments: {',
  "        'clamp-base': ['mesh_1'],",
  "        'arm-lower': ['mesh_4', 'mesh_7'],",
  "        'arm-upper': ['mesh_2', 'mesh_5', 'mesh_6', 'mesh_9'],",
  "        'head-bracket': ['mesh_3', 'mesh_8'],",
  "        'head-mount': ['mesh_0'],",
  '      },',
  '      joints: [',
  "        { joint: 'base-yaw', label: '베이스 회전', parent: 'clamp-base', child: 'arm-lower', axis: [0, 1, 0], point: [0, 0.0229, -0.0473], minDeg: -90, maxDeg: 90 },",
  "        { joint: 'elbow-pitch', label: '팔꿈치 각도', parent: 'arm-lower', child: 'arm-upper', axis: [1, 0, 0], point: [0, 0.0765, -0.0065], minDeg: -35, maxDeg: 35 },",
  "        { joint: 'head-tilt', label: '헤드 틸트', parent: 'arm-upper', child: 'head-bracket', axis: [1, 0, 0], point: [0, 0.1055, 0.0354], minDeg: -30, maxDeg: 30 },",
  "        { joint: 'head-swivel', label: '헤드 좌우', parent: 'head-bracket', child: 'head-mount', axis: [0, 1, 0], point: [0, 0.1076, 0.053], minDeg: -90, maxDeg: 90 },",
  "        { joint: 'head-pivot', label: '헤드 세로회전', parent: 'head-bracket', child: 'head-mount', axis: [0, 0, 1], point: [0, 0.1076, 0.053], minDeg: -90, maxDeg: 90 },",
  '      ],',
  '    },',
].join('\n');

const box = (min: [number, number, number], max: [number, number, number]): Box3Lite => ({
  min,
  max,
});

function twoSegmentDraft(): RigDraft {
  return {
    segments: { base: ['mesh_0'], arm: ['mesh_1'] },
    joints: [
      {
        joint: 'base-yaw',
        label: '베이스 회전',
        parent: 'base',
        child: 'arm',
        axis: [0, 1, 0],
        point: [0, 0, 0],
        minDeg: -90,
        maxDeg: 90,
      },
    ],
  };
}

describe('defaultPivot — 부모∩자식 교집합 중심 휴리스틱', () => {
  it('세 축 모두 겹치면 교집합 상자의 중심을 준다', () => {
    // x/y/z 교집합이 모두 [1, 2] → 중심 1.5
    const r = defaultPivot(box([0, 0, 0], [2, 2, 2]), box([1, 1, 1], [3, 4, 5]));
    expect(r.separated).toBe(false);
    expect(r.point).toEqual([1.5, 1.5, 1.5]);
  });

  it('면이 정확히 맞닿기만 해도(lo === hi) 겹침으로 본다', () => {
    // y: max(0, 2) = 2, min(2, 5) = 2 → lo === hi → 겹침, 중심 2
    const r = defaultPivot(box([0, 0, 0], [2, 2, 2]), box([0, 2, 0], [2, 5, 2]));
    expect(r.separated).toBe(false);
    expect(r.point).toEqual([1, 2, 1]);
  });

  it('한 축이라도 떨어지면 두 bbox 중심의 중점을 준다', () => {
    // y: max(0, 3) = 3 > min(2, 5) = 2 → 분리. 중심 [1,1,1]과 [1,4,1]의 중점
    const r = defaultPivot(box([0, 0, 0], [2, 2, 2]), box([0, 3, 0], [2, 5, 2]));
    expect(r.separated).toBe(true);
    expect(r.point).toEqual([1, 2.5, 1]);
  });

  it('완전히 떨어져 있어도 두 중심의 중점을 준다', () => {
    // 중심 [0.5,0.5,0.5]와 [5,5,5]의 중점 = 2.75
    const r = defaultPivot(box([0, 0, 0], [1, 1, 1]), box([4, 4, 4], [6, 6, 6]));
    expect(r.separated).toBe(true);
    expect(r.point).toEqual([2.75, 2.75, 2.75]);
  });
});

describe('세그먼트 편집', () => {
  it('emptyDraft는 빈 초안이다', () => {
    expect(emptyDraft()).toEqual({ segments: {}, joints: [] });
  });

  it('addSegment는 빈 노드 목록으로 세그먼트를 만든다', () => {
    expect(addSegment(emptyDraft(), 'base').segments).toEqual({ base: [] });
  });

  it('addSegment는 이미 있는 세그먼트의 노드를 지우지 않는다', () => {
    const d = assignPart(addSegment(emptyDraft(), 'base'), 'mesh_0', 'base');
    expect(addSegment(d, 'base').segments).toEqual({ base: ['mesh_0'] });
  });

  it('assignPart는 노드를 이전 세그먼트에서 빼고 새 세그먼트로 옮긴다', () => {
    const d = twoSegmentDraft();
    const moved = assignPart(d, 'mesh_0', 'arm');
    expect(moved.segments).toEqual({ base: [], arm: ['mesh_1', 'mesh_0'] });
    // 중복 소유는 validateManifest가 반려한다 — 옮긴 결과는 통과해야 한다
    expect(validateManifest(toManifest(moved))).toEqual([]);
  });

  it('assignPart(null)은 노드를 어느 세그먼트에도 두지 않는다', () => {
    expect(assignPart(twoSegmentDraft(), 'mesh_1', null).segments).toEqual({
      base: ['mesh_0'],
      arm: [],
    });
  });

  it('removeSegment는 그 세그먼트를 참조하는 관절도 함께 지운다', () => {
    const d = fromManifest(armRig);
    const cut = removeSegment(d, 'head-mount');
    expect(Object.keys(cut.segments)).toEqual([
      'clamp-base',
      'arm-lower',
      'arm-upper',
      'head-bracket',
    ]);
    // head-swivel·head-pivot이 child로 참조하고 있었다
    expect(cut.joints.map((j) => j.joint)).toEqual(['base-yaw', 'elbow-pitch', 'head-tilt']);
    expect(validateManifest(toManifest(cut))).toEqual([]);
  });

  it('removeSegment는 supportPart가 그 세그먼트면 참조를 끊는다', () => {
    expect(removeSegment(fromManifest(armRig), 'clamp-base').supportPart).toBeUndefined();
  });
});

describe('관절 편집', () => {
  const boxes: Record<string, Box3Lite> = {
    base: box([0, 0, 0], [2, 2, 2]),
    arm: box([1, 1, 1], [3, 4, 5]),
  };

  it('addJoint는 defaultPivot으로 point를 채우고 revolute ±90을 기본값으로 준다', () => {
    const d = addJoint(
      twoSegmentDraft(),
      { joint: 'lift', label: '승강', parent: 'base', child: 'arm' },
      boxes,
    );
    expect(d.joints).toHaveLength(2);
    expect(d.joints[1]).toEqual({
      joint: 'lift',
      label: '승강',
      parent: 'base',
      child: 'arm',
      axis: [0, 1, 0],
      point: [1.5, 1.5, 1.5],
      minDeg: -90,
      maxDeg: 90,
    });
    expect(jointKind(d.joints[1])).toBe('revolute');
  });

  it('bbox가 없으면 point는 원점이다', () => {
    const d = addJoint(
      twoSegmentDraft(),
      { joint: 'lift', label: '승강', parent: 'base', child: 'arm' },
      {},
    );
    expect(d.joints[1].point).toEqual([0, 0, 0]);
  });

  it('updateJoint는 해당 id만 패치한다', () => {
    const d = updateJoint(fromManifest(armRig), 'elbow-pitch', { minDeg: -10, maxDeg: 10 });
    expect(d.joints[1]).toMatchObject({ joint: 'elbow-pitch', minDeg: -10, maxDeg: 10 });
    expect(d.joints[0]).toEqual(armRig.joints[0]);
  });

  it('updateJoint에 undefined를 주면 그 필드를 지운다', () => {
    const coupled = updateJoint(twoSegmentDraft(), 'base-yaw', {
      coupledTo: { joint: 'other', ratio: -1 },
    });
    expect(coupled.joints[0].coupledTo).toEqual({ joint: 'other', ratio: -1 });
    const cleared = updateJoint(coupled, 'base-yaw', { coupledTo: undefined });
    expect('coupledTo' in cleared.joints[0]).toBe(false);
  });

  it('removeJoint는 그 관절만 지운다', () => {
    const d = removeJoint(fromManifest(armRig), 'head-pivot');
    expect(d.joints.map((j) => j.joint)).toEqual([
      'base-yaw',
      'elbow-pitch',
      'head-tilt',
      'head-swivel',
    ]);
  });
});

describe('setJointKind — 반대편 한계 필드를 객체에서 실제로 지운다', () => {
  it('revolute → prismatic은 minDeg/maxDeg를 지우고 mm 한계를 넣는다', () => {
    const d = setJointKind(twoSegmentDraft(), 'base-yaw', 'prismatic');
    const j = d.joints[0] as unknown as Record<string, unknown>;
    expect(j.kind).toBe('prismatic');
    expect(j.minMm).toBe(0);
    expect(j.maxMm).toBe(100);
    // 화면에서 숨기는 걸로는 부족하다 — validateManifest가 `!== undefined`로 본다
    expect(j.minDeg).toBeUndefined();
    expect(j.maxDeg).toBeUndefined();
    expect('minDeg' in j).toBe(false);
    expect('maxDeg' in j).toBe(false);
    expect(validateManifest(toManifest(d))).toEqual([]);
  });

  it('prismatic → revolute는 minMm/maxMm를 지우고 도 한계를 넣는다', () => {
    const d = setJointKind(
      setJointKind(twoSegmentDraft(), 'base-yaw', 'prismatic'),
      'base-yaw',
      'revolute',
    );
    const j = d.joints[0] as unknown as Record<string, unknown>;
    expect(j.minDeg).toBe(-90);
    expect(j.maxDeg).toBe(90);
    expect(j.minMm).toBeUndefined();
    expect(j.maxMm).toBeUndefined();
    expect('minMm' in j).toBe(false);
    expect('maxMm' in j).toBe(false);
    expect(validateManifest(toManifest(d))).toEqual([]);
  });

  it('왕복해도 원래 관절과 같아진다(revolute 한계 -90/90 기준)', () => {
    const start = twoSegmentDraft();
    const round = setJointKind(
      setJointKind(start, 'base-yaw', 'prismatic'),
      'base-yaw',
      'revolute',
    );
    expect(round.joints[0]).toEqual(start.joints[0]);
  });

  it('같은 종류로 다시 설정해도 사용자 한계를 잃지 않는다', () => {
    const custom = updateJoint(twoSegmentDraft(), 'base-yaw', { minDeg: -35, maxDeg: 35 });
    const same = setJointKind(custom, 'base-yaw', 'revolute');
    expect(same.joints[0]).toMatchObject({ minDeg: -35, maxDeg: 35 });
    expect(validateManifest(toManifest(same))).toEqual([]);
  });

  it('monitor-arm의 모든 관절을 prismatic으로 바꿔도 매니페스트가 유효하다', () => {
    let d = fromManifest(armRig);
    for (const j of armRig.joints) d = setJointKind(d, j.joint, 'prismatic');
    expect(validateManifest(toManifest(d))).toEqual([]);
    for (const j of d.joints) expect(jointKind(j)).toBe('prismatic');
  });
});

describe('불변성 — 인자를 변형하지 않는다', () => {
  it('assignPart는 입력 초안을 건드리지 않는다', () => {
    const d = twoSegmentDraft();
    const before = structuredClone(d);
    assignPart(d, 'mesh_0', 'arm');
    expect(d).toEqual(before);
  });

  it('setJointKind는 입력 초안과 그 관절 객체를 건드리지 않는다', () => {
    const d = twoSegmentDraft();
    const before = structuredClone(d);
    setJointKind(d, 'base-yaw', 'prismatic');
    expect(d).toEqual(before);
  });

  it('removeSegment/addJoint도 입력 초안을 건드리지 않는다', () => {
    const d = fromManifest(armRig);
    const before = structuredClone(d);
    removeSegment(d, 'head-mount');
    addJoint(d, { joint: 'x', label: '엑스', parent: 'clamp-base', child: 'arm-lower' }, {});
    expect(d).toEqual(before);
  });

  it('fromManifest/toManifest는 원본 매니페스트와 배열을 공유하지 않는다', () => {
    const d = fromManifest(armRig);
    expect(d.joints[0]).not.toBe(armRig.joints[0]);
    expect(d.segments['clamp-base']).not.toBe(armRig.segments['clamp-base']);
    const m = toManifest(d);
    expect(m.joints[0]).not.toBe(d.joints[0]);
    expect(m).toEqual(armRig);
  });
});

describe('serializeTs — product.ts 붙여넣기 블록', () => {
  it('monitor-arm 매니페스트를 바이트 동일하게 재출력한다(포맷 회귀 기준선)', () => {
    expect(serializeTs(fromManifest(armRig))).toBe(ARM_TS);
  });

  it('supportPart가 없으면 그 줄을 뺀다', () => {
    const out = serializeTs({ segments: { base: ['mesh_0'] }, joints: [] });
    expect(out).toBe(
      [
        '    rig: {',
        '      segments: {',
        "        base: ['mesh_0'],",
        '      },',
        '      joints: [],',
        '    },',
      ].join('\n'),
    );
  });

  it('유효한 식별자 키에는 따옴표를 붙이지 않는다', () => {
    const out = serializeTs({ segments: { base: [], 'arm-lower': [], $x1: [] }, joints: [] });
    expect(out).toContain('        base: [],');
    expect(out).toContain("        'arm-lower': [],");
    expect(out).toContain('        $x1: [],');
  });

  it('prismatic 관절은 kind와 mm 한계를 쓴다', () => {
    const d = setJointKind(twoSegmentDraft(), 'base-yaw', 'prismatic');
    expect(serializeTs(d)).toContain(
      "        { joint: 'base-yaw', label: '베이스 회전', kind: 'prismatic', parent: 'base', child: 'arm', axis: [0, 1, 0], point: [0, 0, 0], minMm: 0, maxMm: 100 },",
    );
  });

  it('coupledTo는 관절 줄 끝에 붙고 offset은 있을 때만 나온다', () => {
    const withRatio = updateJoint(twoSegmentDraft(), 'base-yaw', {
      coupledTo: { joint: 'boom-pitch', ratio: -1 },
    });
    expect(serializeTs(withRatio)).toContain("coupledTo: { joint: 'boom-pitch', ratio: -1 } },");
    const withOffset = updateJoint(twoSegmentDraft(), 'base-yaw', {
      coupledTo: { joint: 'boom-pitch', ratio: -1, offset: 5 },
    });
    expect(serializeTs(withOffset)).toContain(
      "coupledTo: { joint: 'boom-pitch', ratio: -1, offset: 5 } },",
    );
  });

  it('좌표는 소수 4자리로 반올림하고 불필요한 0을 떨군다', () => {
    const d = updateJoint(twoSegmentDraft(), 'base-yaw', {
      point: [0.1000001, -0.02294999, 1e-9],
    });
    expect(serializeTs(d)).toContain('point: [0.1, -0.0229, 0]');
  });

  it('작은따옴표가 든 라벨을 이스케이프한다', () => {
    const d = updateJoint(twoSegmentDraft(), 'base-yaw', { label: "it's" });
    expect(serializeTs(d)).toContain("label: 'it\\'s'");
  });

  it('빈 초안도 유효한 블록을 낸다', () => {
    expect(serializeTs(emptyDraft())).toBe(
      ['    rig: {', '      segments: {},', '      joints: [],', '    },'].join('\n'),
    );
  });
});

describe('serializeJson', () => {
  it('toManifest 결과를 2칸 들여쓴 JSON으로 낸다', () => {
    const d = fromManifest(armRig);
    expect(serializeJson(d)).toBe(JSON.stringify(toManifest(d), null, 2));
    expect(JSON.parse(serializeJson(d))).toEqual(armRig);
  });

  it('JSON을 되읽으면 validateManifest를 통과한다', () => {
    const parsed = JSON.parse(serializeJson(fromManifest(armRig))) as ReturnType<typeof toManifest>;
    expect(validateManifest(parsed)).toEqual([]);
    // 되읽은 관절도 RigJoint로 그대로 쓰인다
    const first: RigJoint = parsed.joints[0];
    expect(first.joint).toBe('base-yaw');
  });
});
