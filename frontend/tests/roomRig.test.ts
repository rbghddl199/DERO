import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { createRoomRig } from '../src/three/scene/roomRig';
import type { TimeOfDay } from '../src/three/finishes/types';

function lightsOf(scene: THREE.Scene): THREE.Light[] {
  const out: THREE.Light[] = [];
  scene.traverse((o) => {
    const l = o as THREE.Light;
    if (l.isLight) out.push(l);
  });
  return out;
}

function byType<T extends THREE.Light>(scene: THREE.Scene, type: string): T[] {
  return lightsOf(scene).filter((l) => l.type === type) as T[];
}

describe('createRoomRig', () => {
  it('builds the neutral base rig with the calibrated physical-lumen intensities', () => {
    const scene = new THREE.Scene();
    createRoomRig(scene);

    const directionals = byType<THREE.DirectionalLight>(scene, 'DirectionalLight');
    expect(directionals.map((l) => l.intensity).sort((a, b) => a - b)).toEqual([17, 20, 60]);

    const hemi = byType<THREE.HemisphereLight>(scene, 'HemisphereLight');
    expect(hemi).toHaveLength(1);
    expect(hemi[0].intensity).toBe(6);
    expect(hemi[0].groundColor.getHex()).toBe(0x9a938a);

    const ambient = byType<THREE.AmbientLight>(scene, 'AmbientLight');
    expect(ambient).toHaveLength(1);
    expect(ambient[0].intensity).toBe(7);
  });

  // 옛 `e2e/lighting.spec.ts`의 "기본 상태 벽 R/B 중립" 픽셀 가드가 지키던 것이 이 성질이다
  // (DERO-508에서 이관). 시뮬레이터의 기본 상태는 이제 사용자 데이터(벽면 마감)라
  // 그 화면으로는 조명의 중립성을 물을 수 없다 — 물어야 할 곳은 검수 조명의 정본인 이 rig이고,
  // 관리자 발광 프리뷰(`scene/emitterPreview.ts`)가 같은 모듈을 쓴다. 여기에 색이 끼면
  // 관리자가 고른 lm·색온도가 시뮬레이터와 어긋난다.
  it('keeps every rig light achromatic — the fixed neutral base product review compares against', () => {
    const scene = new THREE.Scene();
    createRoomRig(scene);

    // 반구광의 `groundColor`(0x9a938a)는 예외다 — 바닥 반사를 흉내내는 따뜻한 회색이고
    // 아래에서 올라오므로 벽 밴드를 물들이지 않는다. 위쪽으로 쏘는 색은 전부 무채여야 한다.
    for (const light of lightsOf(scene)) {
      const { r, g, b } = light.color;
      expect(g, `${light.type} 광원 색이 무채가 아니다`).toBe(r);
      expect(b, `${light.type} 광원 색이 무채가 아니다`).toBe(r);
    }
  });

  it('gives the key light a shadow camera sized to the room', () => {
    const scene = new THREE.Scene();
    createRoomRig(scene);

    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.intensity === 60,
    )!;
    expect(key.castShadow).toBe(true);
    expect(key.shadow.mapSize.width).toBe(2048);
    expect(key.shadow.camera.near).toBe(0.5);
    expect(key.shadow.camera.far).toBe(14);
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    expect([cam.left, cam.right, cam.top, cam.bottom]).toEqual([-2.2, 2.2, 2.2, -2.2]);
    expect(key.shadow.bias).toBeCloseTo(-0.0006, 6);
    expect(key.shadow.normalBias).toBeCloseTo(0.004, 6);
  });

  it('starts on, with the environment/background scaled to the room-on values', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);

    expect(rig.roomOn()).toBe(true);
    expect(scene.environmentIntensity).toBe(10);
    expect(scene.backgroundIntensity).toBe(20);
  });

  it('turns off by zeroing intensity — never by toggling visible/castShadow (shader rebuild)', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.intensity === 60,
    )!;

    expect(rig.setRoomLight(false)).toBe(false);
    expect(rig.roomOn()).toBe(false);

    for (const l of lightsOf(scene)) expect(l.visible).toBe(true);
    expect(key.castShadow).toBe(true);
    // 태양(key)은 방 조명이 아니라 시간대가 쥔다 — 주간에 조명을 꺼도 햇살은 그대로다
    // (자연광만 드는 아침, ADR-0030 결정 4).
    expect(key.intensity).toBe(60);
    for (const l of byType<THREE.DirectionalLight>(scene, 'DirectionalLight')) {
      expect(l.intensity).toBe(l === key ? 60 : 0);
    }
    expect(byType<THREE.HemisphereLight>(scene, 'HemisphereLight')[0].intensity).toBe(0);
    expect(scene.environmentIntensity).toBe(1.0);
    expect(scene.backgroundIntensity).toBe(3.0);
  });

  it('keeps the ambient floor lit while the room light is off (dim, not pitch black)', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    rig.setRoomLight(false);

    expect(byType<THREE.AmbientLight>(scene, 'AmbientLight')[0].intensity).toBe(7);
  });

  it('keeps a fixed neutral day rig for anyone who never sets a time of day', () => {
    // 관리자 발광 프리뷰(`scene/emitterPreview.ts`)가 그 경로다 — 방 한 벌을 받지 않으므로
    // 검수 조명이 시간대를 따라갈 방법이 구조적으로 없다(사용자 스토리 39).
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    expect(rig.sunOn()).toBe(true);
  });

  it('restores the exact authored intensities when toggled back on', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    rig.setRoomLight(false);
    expect(rig.setRoomLight(true)).toBe(true);

    expect(
      byType<THREE.DirectionalLight>(scene, 'DirectionalLight')
        .map((l) => l.intensity)
        .sort((a, b) => a - b),
    ).toEqual([17, 20, 60]);
    expect(byType<THREE.HemisphereLight>(scene, 'HemisphereLight')[0].intensity).toBe(6);
    expect(scene.environmentIntensity).toBe(10);
  });
});

// 시간대(DERO-510). 시간대와 방 조명은 **별개 축 두 개**라 조합이 4개다
// (ADR-0030 결정 4) — 병합하면 "자연광만 드는 아침"과 "천장등 켠 밤"이 영구히 사라진다.
describe('createRoomRig — time of day', () => {
  const COMBOS: { time: TimeOfDay; room: boolean }[] = [
    { time: 'DAY', room: true },
    { time: 'DAY', room: false },
    { time: 'NIGHT', room: true },
    { time: 'NIGHT', room: false },
  ];

  /** 화면 밝기의 대리 지표 — 광원 세기 합. 절대값이 아니라 조합 사이의 **관계**만 본다. */
  function totalIntensity(scene: THREE.Scene): number {
    return lightsOf(scene).reduce((sum, l) => sum + l.intensity, 0);
  }

  function rigFor(time: TimeOfDay, room: boolean): THREE.Scene {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    rig.setTimeOfDay(time);
    rig.setRoomLight(room);
    return scene;
  }

  // **이 단언이 성능 회귀 가드다.** 광원 개수나 `castShadow` 집합을 런타임에 바꾸면
  // 셰이더가 재빌드되어 실기 WebGPU가 1.2~1.9초 멈춘다(DERO-238).
  it('never changes the light set or the castShadow set across any combination', () => {
    const base = rigFor('DAY', true);
    const baseTypes = lightsOf(base)
      .map((l) => l.type)
      .sort();
    const baseCasters = lightsOf(base).filter((l) => l.castShadow).length;
    expect(baseCasters).toBe(1); // 그림자 칸 3 = 램프 2 + key 1

    for (const { time, room } of COMBOS) {
      const scene = rigFor(time, room);
      const label = `${time}/room ${room ? 'on' : 'off'}`;
      expect(
        lightsOf(scene)
          .map((l) => l.type)
          .sort(),
        label,
      ).toEqual(baseTypes);
      expect(lightsOf(scene).filter((l) => l.castShadow).length, label).toBe(baseCasters);
      for (const l of lightsOf(scene)) expect(l.visible, label).toBe(true);
    }
  });

  it('makes the same room darker at night than by day, with either room-light state', () => {
    for (const room of [true, false]) {
      expect(totalIntensity(rigFor('NIGHT', room))).toBeLessThan(
        totalIntensity(rigFor('DAY', room)),
      );
    }
  });

  it('leaves night dim, never pitch black — the silhouette still reads', () => {
    const scene = rigFor('NIGHT', false); // 가장 어두운 조합
    expect(byType<THREE.AmbientLight>(scene, 'AmbientLight')[0].intensity).toBe(7);
    expect(scene.environmentIntensity).toBeGreaterThan(0);
    expect(totalIntensity(scene)).toBeGreaterThan(0);
  });

  it('gives all four combinations a distinct brightness — neither axis swallows the other', () => {
    const totals = COMBOS.map(({ time, room }) => totalIntensity(rigFor(time, room)));
    expect(new Set(totals).size).toBe(COMBOS.length);
  });

  // 창문(DERO-511, ADR-0030 결정 7) — 태양은 주 창문을 따라가고, 창문이 없으면
  // 주간에도 세기 0이다. 광원과 castShadow는 어느 조합에서도 그대로다.
  it('zeroes the sun when there is no window, without touching the light set', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.castShadow,
    )!;

    rig.setSunWindow(null);
    expect(rig.sunOn()).toBe(false);
    expect(key.intensity).toBe(0);
    expect(key.castShadow).toBe(true);
    expect(key.visible).toBe(true);

    rig.setSunWindow('front');
    expect(rig.sunOn()).toBe(true);
    expect(key.intensity).toBe(60);
  });

  it('points the sun through the primary window — direction only, per side', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.castShadow,
    )!;

    // 전면 창: 태양이 전면 벽 바깥(-z)에서 방(+z)으로 들어온다.
    rig.setSunWindow('front');
    expect(key.position.z).toBeLessThan(0);
    // 좌 창: 좌 벽 바깥(-x)에서 +x로.
    rig.setSunWindow('left');
    expect(key.position.x).toBeLessThan(0);
    // 우 창: 우 벽 바깥(+x)에서 -x로.
    rig.setSunWindow('right');
    expect(key.position.x).toBeGreaterThan(0);
    // 어느 방향이든 태양은 위에서 내려온다(그림자 ortho 카메라가 방을 덮는 전제).
    expect(key.position.y).toBeGreaterThan(0);
  });

  it('keeps night dominant over the window — a window never lights the night', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.castShadow,
    )!;
    rig.setSunWindow('front');
    rig.setTimeOfDay('NIGHT');
    expect(rig.sunOn()).toBe(false);
    expect(key.intensity).toBe(0);
    rig.setTimeOfDay('DAY');
    expect(key.intensity).toBe(60);
  });

  it('never changes the light set or castShadow set across window states either', () => {
    // 시간대 조합 가드와 같은 성능 회귀 가드다 — 창문 축이 늘어도 광원 집합은 불변이다.
    const base = new THREE.Scene();
    createRoomRig(base);
    const baseTypes = lightsOf(base)
      .map((l) => l.type)
      .sort();

    for (const side of ['front', 'left', 'right', null] as const) {
      for (const time of ['DAY', 'NIGHT'] as TimeOfDay[]) {
        const scene = new THREE.Scene();
        const rig = createRoomRig(scene);
        rig.setTimeOfDay(time);
        rig.setSunWindow(side);
        const label = `${String(side)}/${time}`;
        expect(
          lightsOf(scene)
            .map((l) => l.type)
            .sort(),
          label,
        ).toEqual(baseTypes);
        expect(lightsOf(scene).filter((l) => l.castShadow).length, label).toBe(1);
        for (const l of lightsOf(scene)) expect(l.visible, label).toBe(true);
      }
    }
  });

  it('turns the sun off at night while the room light stays under the user’s control', () => {
    const scene = new THREE.Scene();
    const rig = createRoomRig(scene);
    const key = byType<THREE.DirectionalLight>(scene, 'DirectionalLight').find(
      (l) => l.castShadow,
    )!;

    rig.setTimeOfDay('NIGHT');
    expect(rig.sunOn()).toBe(false);
    expect(key.intensity).toBe(0);
    // 시간대는 방 조명 값을 건드리지 않는다 — 기본값 연동은 스토어의 일이다.
    expect(rig.roomOn()).toBe(true);
    expect(byType<THREE.HemisphereLight>(scene, 'HemisphereLight')[0].intensity).toBe(6);

    rig.setRoomLight(false);
    expect(key.intensity).toBe(0);
    rig.setTimeOfDay('DAY');
    expect(key.intensity).toBe(60);
    expect(rig.roomOn()).toBe(false);
  });
});
