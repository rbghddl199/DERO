import { describe, it, expect } from 'vitest';
import {
  resolveEmitterColor,
  emitterLightFlags,
  selectEmitterMeshes,
  EMITTER_LIGHT_CAP,
  type EmitterManifest,
} from '../src/three/scene/emitters';

const fixed: EmitterManifest = {
  recolorable: false,
  defaultColor: '#3F6EC2',
  lumens: 45,
  radiusMm: 450,
};

const variable: EmitterManifest = {
  recolorable: true,
  defaultColor: '#6060E0',
  lumens: 30,
  radiusMm: 400,
};

describe('resolveEmitterColor (recolorable이 정본, 인스턴스 색은 종속)', () => {
  it('고정 발광: 인스턴스 색이 있어도 무시하고 defaultColor를 쓴다', () => {
    expect(resolveEmitterColor(fixed, '#FF0000')).toBe('#3F6EC2');
  });
  it('가변 발광: 인스턴스 색이 있으면 그것을 쓴다', () => {
    expect(resolveEmitterColor(variable, '#FF0000')).toBe('#FF0000');
  });
  it('가변 발광: 인스턴스 색이 없으면 defaultColor로 폴백한다', () => {
    expect(resolveEmitterColor(variable)).toBe('#6060E0');
    expect(resolveEmitterColor(variable, undefined)).toBe('#6060E0');
  });
  it('#RRGGBB가 아닌 인스턴스 값은 defaultColor로 폴백한다 (DB VARCHAR 경유)', () => {
    for (const bad of ['', 'red', '#FFF', '6060E0', '#12345g']) {
      expect(resolveEmitterColor(variable, bad)).toBe('#6060E0');
    }
  });
  it('소문자 표기도 그대로 통과한다', () => {
    expect(resolveEmitterColor(variable, '#a0ff20')).toBe('#a0ff20');
  });
});

describe('emitter PointLight 캡 (LAMP_SHADOW_CAP 옆자리, ADR-0003 결정 6)', () => {
  it('WebGL2 폴백 캡이 WebGPU 캡보다 낮다', () => {
    expect(EMITTER_LIGHT_CAP.webgl).toBeLessThan(EMITTER_LIGHT_CAP.webgpu);
    expect(EMITTER_LIGHT_CAP.webgl).toBeGreaterThanOrEqual(1);
  });
});

describe('emitterLightFlags (카메라 근접순 — 램프 그림자의 배치순과 대조)', () => {
  it('발광체가 없으면 빈 배열', () => {
    expect(emitterLightFlags([], 6)).toEqual([]);
  });
  it('캡과 같은 수면 전부 살아 있다', () => {
    expect(emitterLightFlags([3, 1, 2], 3)).toEqual([true, true, true]);
  });
  it('캡+1이면 가장 먼 하나만 emissive-only로 떨어진다', () => {
    expect(emitterLightFlags([3, 1, 2, 0.5], 3)).toEqual([false, true, true, true]);
  });
  it('배치 순서가 아니라 거리 순으로 배정한다', () => {
    // 먼저 놓인 두 개가 멀리 있으면 나중에 놓인 가까운 것이 이긴다
    expect(emitterLightFlags([9, 8, 0.2, 0.1], 2)).toEqual([false, false, true, true]);
  });
  it('캡 0이면 전부 emissive-only', () => {
    expect(emitterLightFlags([1, 2, 3], 0)).toEqual([false, false, false]);
  });
  it('캡이 발광체 수보다 많아도 넘치지 않는다', () => {
    expect(emitterLightFlags([1, 2], 6)).toEqual([true, true]);
  });
  it('동거리 타이는 낮은 인덱스가 이긴다 (프레임 간 깜빡임 방지)', () => {
    expect(emitterLightFlags([1, 1, 1, 1], 2)).toEqual([true, true, false, false]);
  });
  it('같은 입력은 항상 같은 결과 — 정렬이 안정적이다', () => {
    const d = [2, 1, 2, 1, 2, 1];
    const first = emitterLightFlags(d, 3);
    for (let i = 0; i < 5; i++) expect(emitterLightFlags(d, 3)).toEqual(first);
    expect(first).toEqual([false, true, false, true, false, true]);
  });
  it('입력 배열을 변형하지 않는다', () => {
    const d = [3, 1, 2];
    emitterLightFlags(d, 1);
    expect(d).toEqual([3, 1, 2]);
  });
});

interface FakeMesh {
  tag: string;
  lit?: boolean;
}
const lit = (m: FakeMesh): boolean => m.lit === true;

describe('selectEmitterMeshes (표시된 것만 — 없으면 전부가 폴백)', () => {
  it('표시된 메쉬가 있으면 그 부분집합만 돌려준다', () => {
    const slab: FakeMesh = { tag: 'slab' };
    const plate: FakeMesh = { tag: 'plate', lit: true };
    expect(selectEmitterMeshes([slab, plate], lit)).toEqual([plate]);
  });
  it('표시가 하나도 없으면 전부 돌려준다 (GLB 에셋 = 텍셀 마스크 도입 전 현행 유지)', () => {
    const meshes: FakeMesh[] = [{ tag: 'a' }, { tag: 'b' }, { tag: 'c' }];
    expect(selectEmitterMeshes(meshes, lit)).toEqual(meshes);
  });
  it('빈 입력은 빈 결과 — 폴백이 없는 것을 만들어내지 않는다', () => {
    expect(selectEmitterMeshes([], lit)).toEqual([]);
  });
  it('전부 표시돼 있으면 전부 (폴백 경로와 결과가 같아도 경로가 다르다)', () => {
    const meshes: FakeMesh[] = [
      { tag: 'a', lit: true },
      { tag: 'b', lit: true },
    ];
    expect(selectEmitterMeshes(meshes, lit)).toEqual(meshes);
  });
  it('입력 순서를 보존하고 입력 배열을 변형하지 않는다', () => {
    const meshes: FakeMesh[] = [{ tag: 'a', lit: true }, { tag: 'b' }, { tag: 'c', lit: true }];
    const snapshot = [...meshes];
    expect(selectEmitterMeshes(meshes, lit).map((m) => m.tag)).toEqual(['a', 'c']);
    expect(meshes).toEqual(snapshot);
  });
  it('폴백은 입력 배열 자체가 아니라 복사본이다 (호출자가 밀어 넣어도 원본이 안 는다)', () => {
    const meshes: FakeMesh[] = [{ tag: 'a' }];
    const out = selectEmitterMeshes(meshes, lit);
    expect(out).not.toBe(meshes);
    out.push({ tag: 'b' });
    expect(meshes).toHaveLength(1);
  });
});
