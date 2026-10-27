import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  analyzeLightAsset,
  computeShadeGate,
  judgeShadeGate,
  reviewLightAsset,
  toPointMm,
  LIGHT_ORIGIN_NODE_NAME,
  SHADE_MESH_NAME,
} from '../src/three/core/lightAuthoring';
import { beamHalfAngleRad } from '../src/three/scene/lighting';

// 조명 GLB가 아직 0장이라 실물 파일로는 검증할 수 없다 — GLTFLoader가 만들어 줄 씬그래프를
// 코드로 그대로 조립해 검증한다(노드 이름·중첩 변환·갓 정점은 로더가 손대지 않는 값이다).

const deg = (rad: number): number => (rad * 180) / Math.PI;

/** props.ts의 절차 램프 갓 그대로: CylinderGeometry(0.05, 0.075, 0.2, 28, 1, true) */
function shadeMesh(tiltZ: number, rTop = 0.05, rBot = 0.075, height = 0.2): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, height, 28, 1, true));
  mesh.name = SHADE_MESH_NAME;
  // 갓 윗구멍이 광원 높이에 오도록 놓는다(264가 고친 배치 — 광원이 갓 윗구멍이다).
  mesh.position.y = -height / 2;
  mesh.rotation.z = tiltZ;
  return mesh;
}

function originNode(x = 0, y = 0, z = 0): THREE.Object3D {
  const node = new THREE.Object3D();
  node.name = LIGHT_ORIGIN_NODE_NAME;
  node.position.set(x, y, z);
  return node;
}

/** 갓 + 원점(0,0,0)에 놓인 light_origin 한 벌 */
function lampRoot(tiltZ: number, rTop = 0.05, rBot = 0.075, height = 0.2): THREE.Group {
  const root = new THREE.Group();
  root.add(originNode(), shadeMesh(tiltZ, rTop, rBot, height));
  return root;
}

describe('analyzeLightAsset — light_origin 노드 → mm', () => {
  it('중첩된 부모 변환까지 합쳐 제품 로컬 좌표를 mm 정수로 돌려준다', () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.position.set(0.1, 0.2, -0.05);
    arm.add(originNode(0.0125, 0.2005, 0.0004));
    root.add(arm);

    const a = analyzeLightAsset(root);

    expect(a.originNodeCount).toBe(1);
    expect(a.originIsEmpty).toBe(true);
    expect(a.originM?.x).toBeCloseTo(0.1125, 6);
    expect(a.originM?.y).toBeCloseTo(0.4005, 6);
    expect(a.originM?.z).toBeCloseTo(-0.0496, 6);
    // 반올림: 0.1125 m -> 113 mm, 0.4005 m -> 401 mm(0.5 올림), -0.0496 m -> -50 mm
    expect(a.pointMm).toEqual({ point_x_mm: 113, point_y_mm: 401, point_z_mm: -50 });
  });

  it('mm 변환은 0.5를 올림한다', () => {
    expect(toPointMm({ x: 0.0005, y: -0.0005, z: 0 })).toEqual({
      point_x_mm: 1,
      point_y_mm: 0,
      point_z_mm: 0,
    });
  });

  it('노드가 없으면 좌표가 null이다 (bbox 중심 폴백 경로)', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));

    const a = analyzeLightAsset(root);

    expect(a.originNodeCount).toBe(0);
    expect(a.originM).toBeNull();
    expect(a.pointMm).toBeNull();
    expect(a.gate).toBeNull();
  });

  it('이름은 정확 일치만 인정한다 — 익스포터 접미사는 다른 노드다', () => {
    const root = new THREE.Group();
    const near = new THREE.Object3D();
    near.name = `${LIGHT_ORIGIN_NODE_NAME}.001`;
    root.add(near);

    expect(analyzeLightAsset(root).originNodeCount).toBe(0);
  });

  it('메쉬거나 자식이 달렸으면 Empty가 아니다', () => {
    const root = new THREE.Group();
    const asMesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
    asMesh.name = LIGHT_ORIGIN_NODE_NAME;
    asMesh.position.set(0, 0.3, 0);
    root.add(asMesh);

    const a = analyzeLightAsset(root);

    expect(a.originNodeCount).toBe(1);
    expect(a.originIsEmpty).toBe(false);
    // 규약 위반이어도 위치는 그대로 읽는다(등록을 막지 않는다).
    expect(a.pointMm).toEqual({ point_x_mm: 0, point_y_mm: 300, point_z_mm: 0 });
  });

  it('같은 이름이 둘이면 개수를 세고 첫 노드로 계산한다', () => {
    const root = new THREE.Group();
    root.add(originNode(0, 0.3, 0), originNode(0, 0.9, 0));

    const a = analyzeLightAsset(root);

    expect(a.originNodeCount).toBe(2);
    expect(a.pointMm?.point_y_mm).toBe(300);
  });
});

describe('computeShadeGate — 갓 차단 시작각', () => {
  it('안 기운 원통 갓은 방위별 차단각이 하나로 모인다 (rBot 75mm / H 200mm → 20.56°)', () => {
    const a = analyzeLightAsset(lampRoot(0));
    const gate = a.gate;

    expect(gate).not.toBeNull();
    if (!gate) return;
    expect(gate.meshCount).toBe(1);
    expect(gate.rBotM).toBeCloseTo(0.075, 6);
    expect(gate.depthM).toBeCloseTo(0.2, 6);
    expect(deg(gate.blockAngleRad)).toBeCloseTo(20.556, 2);
    expect(deg(gate.minBlockAngleRad)).toBeCloseTo(20.556, 2);
    expect(deg(gate.maxBlockAngleRad)).toBeCloseTo(20.556, 2);
  });

  it('기운 갓(props.ts 절차 램프, rotation.z=0.12)은 방위마다 16.7°~24.4°로 갈린다', () => {
    // 265 실측 정본: asset-pipeline.md "atan(rBot/H) 하나는 갓이 안 기울었을 때의 근사다".
    const gate = analyzeLightAsset(lampRoot(0.12)).gate;

    expect(gate).not.toBeNull();
    if (!gate) return;
    // 실측 16.7022°. 방위 32빈 양자화 때문에 최대값만 실제 극값(24.42°)보다 0.08° 낮게 잡힌다.
    expect(deg(gate.minBlockAngleRad)).toBeCloseTo(16.7, 1);
    expect(deg(gate.maxBlockAngleRad)).toBeGreaterThan(24.2);
    expect(deg(gate.maxBlockAngleRad)).toBeLessThan(24.5);
    // 기울기를 무시한 단일 근사(이상적 원통 20.556°)는 그 범위 안에 있다 — 범위를 보여줘야 하는 이유다.
    expect(gate.blockAngleRad).toBeGreaterThan(gate.minBlockAngleRad);
    expect(gate.blockAngleRad).toBeLessThan(gate.maxBlockAngleRad);
    expect(deg(gate.blockAngleRad)).toBeCloseTo(20.6, 0);
  });

  it('lampShade가 여럿이면 전부 합쳐 재고, 먼저 가리는 갓이 차단 시작각을 정한다', () => {
    const root = lampRoot(0);
    // 깊이 0.1 / 반경 0.12로 더 넓게 열린 갓(50.19°). 광선은 둘 중 먼저 닿는 쪽에서 막히므로
    // 좁고 깊은 갓(20.56°)이 여전히 차단 시작각이다.
    root.add(shadeMesh(0, 0.05, 0.12, 0.1));

    const gate = analyzeLightAsset(root).gate;

    expect(gate?.meshCount).toBe(2);
    expect(deg(gate?.maxBlockAngleRad ?? 0)).toBeCloseTo(20.556, 2);
  });

  it('갓이 광원보다 위에만 있으면 차단각을 만들 수 없다', () => {
    const root = new THREE.Group();
    const shade = shadeMesh(0);
    shade.position.y = 0.5; // 광원(0,0,0)보다 통째로 위
    root.add(originNode(), shade);

    expect(analyzeLightAsset(root).gate).toBeNull();
    expect(computeShadeGate([], { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('lampShade 이름이 아닌 메쉬(받침·폴)는 표본에 안 들어간다', () => {
    const root = lampRoot(0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 24));
    base.name = 'lampBase';
    base.position.y = -0.4;
    root.add(base);

    const gate = analyzeLightAsset(root).gate;

    expect(gate?.meshCount).toBe(1);
    expect(gate?.rBotM).toBeCloseTo(0.075, 6);
  });
});

describe('judgeShadeGate — 빔 반각 비교', () => {
  const gateOf = (tilt: number, rTop?: number, rBot?: number, h?: number) => {
    const gate = analyzeLightAsset(lampRoot(tilt, rTop, rBot, h)).gate;
    if (!gate) throw new Error('gate 없음');
    return gate;
  };

  it('절차 램프 갓: flood(40.1°)는 전 방위 차단, spot(18.3°)은 일부 방위만', () => {
    const gate = gateOf(0.12);
    expect(judgeShadeGate(gate, beamHalfAngleRad('flood'))).toBe('blocks');
    expect(judgeShadeGate(gate, beamHalfAngleRad('spot'))).toBe('partial');
  });

  it('얕은 접시형 갓(rBot 92mm / H 50mm = 61.5°)은 어느 프리셋에서도 무늬를 못 낸다', () => {
    const gate = gateOf(0, 0.05, 0.092, 0.05);
    expect(deg(gate.blockAngleRad)).toBeCloseTo(61.5, 1);
    expect(judgeShadeGate(gate, beamHalfAngleRad('flood'))).toBe('none');
    expect(judgeShadeGate(gate, beamHalfAngleRad('spot'))).toBe('none');
  });
});

describe('reviewLightAsset — 경고 (등록은 절대 막지 않는다)', () => {
  const flood = beamHalfAngleRad('flood');
  const messages = (root: THREE.Object3D, beam = flood): string[] =>
    reviewLightAsset(analyzeLightAsset(root), beam).map((i) => `${i.level}:${i.message}`);

  it('light_origin이 없고 lampShade가 있으면 error다 (bbox 중심은 폴대 중간이라 조용히 틀린다)', () => {
    const root = new THREE.Group();
    root.add(shadeMesh(0));

    const issues = reviewLightAsset(analyzeLightAsset(root), flood);
    const origin = issues.find((i) => i.message.includes(LIGHT_ORIGIN_NODE_NAME));

    expect(origin?.level).toBe('error');
    expect(origin?.message).toContain('bbox 중심');
  });

  it('light_origin도 lampShade도 없으면 warn이다 (바형 제품은 bbox 중심이 맞다)', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02)));

    const issues = reviewLightAsset(analyzeLightAsset(root), flood);
    const origin = issues.find((i) => i.message.includes(LIGHT_ORIGIN_NODE_NAME));

    expect(origin?.level).toBe('warn');
    expect(origin?.message).toContain('모니터라이트');
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('무늬를 못 내는 갓은 warn 한 줄로만 알린다', () => {
    const root = lampRoot(0, 0.05, 0.092, 0.05);

    const issues = reviewLightAsset(analyzeLightAsset(root), flood);
    const verdict = issues.find((i) => i.message.includes('무늬'));

    expect(verdict?.level).toBe('warn');
    expect(verdict?.message).toContain('무늬를 내지 않는다');
    expect(verdict?.message).toContain('등록은 막지 않는다');
  });

  it('기운 갓 + spot이면 방위 범위를 문구에 실어 준다', () => {
    const issues = reviewLightAsset(analyzeLightAsset(lampRoot(0.12)), beamHalfAngleRad('spot'));
    const verdict = issues.find((i) => i.message.includes('무늬'));

    expect(verdict?.level).toBe('warn');
    expect(verdict?.message).toContain('16.7°');
    expect(verdict?.message).toContain('바깥 테두리');
  });

  it('갓이 빔을 깎으면 info다', () => {
    const issues = reviewLightAsset(analyzeLightAsset(lampRoot(0.12)), flood);
    expect(issues.every((i) => i.level === 'info')).toBe(true);
  });

  it('lampShade가 없는 제품은 흰 마스크로 정상 렌더된다고 알린다', () => {
    const root = new THREE.Group();
    root.add(originNode(0, 0.3, 0));

    expect(messages(root).some((m) => m.startsWith('info:') && m.includes('흰색'))).toBe(true);
  });
});
