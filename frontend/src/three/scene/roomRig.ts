// 방 조명 리그 — 태양(key) + 중립 고정 fill/rim/hemi + 상시 ambient floor. 시뮬레이터 씬과 관리자 발광 프리뷰가 이 한 모듈을 공유한다(수치가 갈리면 프리뷰가 거짓말을 한다).
import * as THREE from 'three/webgpu';
import type { TimeOfDay } from '@/three/finishes/types';
import type { WallSide } from '@/three/core/snap';

export interface RoomRig {
  /** 방 조명 on/off. 반환값은 적용된 상태(호출부가 그대로 UI에 싣는다). */
  setRoomLight(on: boolean): boolean;
  roomOn(): boolean;
  /** 시간대 — 태양(key)과 환경/배경 스케일만 움직인다. 방 조명과는 별개 축이라
   *  둘의 조합 4개가 전부 만들어진다(ADR-0030 결정 4). */
  setTimeOfDay(time: TimeOfDay): void;
  /** 주 창문 — 태양(key)의 **방향만** 그 면의 법선 쪽으로 재정의한다(ADR-0030 결정 7).
   *  `null`은 "창문 없음(또는 그 벽이 꺼짐)"이고 주간에도 세기 0이다 — 광원과
   *  `castShadow`는 그대로라 셰이더 재빌드가 없다. 부르는 곳은 씬의 `applyRoom`·`setWall`
   *  뿐이고, **안 부르면 부팅 기본(창문 있음 취급 + 중립 방향)이다** — 관리자 발광
   *  프리뷰가 그 경로라 검수 조명이 창문·시간대에 구조적으로 안 흔들린다. */
  setSunWindow(side: WallSide | null): void;
  /** 태양이 실제로 빛을 내고 있는가(= 주간 그리고 주 창문 있음). 그림자 캐스터 집계가
   *  이 값을 쓴다 — `castShadow` 플래그는 어느 조합에서도 true다. */
  sunOn(): boolean;
}

/** 주간 태양 세기. 야간·창문 없음은 0이고 **광원은 그대로 있다**(ADR-0030 결정 7). */
const SUN_INTENSITY = 60;

/** 주 창문 면별 태양 위치(m, 방향 전용 — DirectionalLight라 거리와 무관하고 그림자
 *  ortho 카메라(±2.2, far 14)가 방을 다 덮는 거리면 된다). 창밖에서 창을 통해 비껴
 *  들어오는 고도 ~35° — 부팅 기본(2.6, 4.2, 2.4)보다 낮아 햇살 자락이 방 안까지 든다. */
const SUN_POSITIONS: Readonly<Record<WallSide, readonly [number, number, number]>> = {
  front: [1.6, 3.6, -5.0],
  left: [-5.0, 3.6, 1.6],
  right: [5.0, 3.6, 1.6],
};

/** 야간 환경/배경 스케일 — 창밖이 어두워진 만큼 실내 반사도 준다. */
const NIGHT_ENV_SCALE = 0.25;

/**
 * 베이스 리그를 `scene`에 붙인다 (색온도·밝기 모듈레이션 없음 — 무드는 배치된 램프의
 * 로컬 SpotLight만 만든다). 낮은 ambient floor는 항상 켜져 있어 야간 + 조명 OFF가
 * "칠흑"이 아니라 "실루엣이 읽히는 어둑함"이다.
 *
 * <p>축은 둘이고 **병합하지 않는다**(ADR-0030 결정 4): 시간대는 태양(key)을, 방 조명은
 * fill/rim/hemi를 쥔다. 그래서 "자연광만 드는 아침"(주간 + 조명 OFF)과 "천장등 켠
 * 밤"(야간 + 조명 ON)이 둘 다 만들어진다.
 *
 * <p>**시간대를 안 부르면 주간 고정이다** — 관리자 발광 프리뷰(`emitterPreview.ts`)는
 * 방 한 벌을 받지 않으므로 구조적으로 고정 중립 조명을 쓴다(검수 화면 무회귀).
 *
 * <p>세기는 전부 물리 광속 스케일이다(`render/renderer.ts`의 `CAMERA_EXPOSURE` 1/20과
 * 짝) — 옛 값의 20배이고 노출이 그만큼 나눈다. **글레어 문턱 50이 이 값들과 짝이므로**
 * (`postfx.ts`) key·floor를 올리면 흰 벽이 문턱을 넘어 벽 전체가 번진다.
 */
export function createRoomRig(scene: THREE.Scene): RoomRig {
  const key = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
  key.position.set(2.6, 4.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -2.2;
  sc.right = 2.2;
  sc.top = 2.2;
  sc.bottom = -2.2;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = 6;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xffffff, 17);
  fill.position.set(-3, 2.4, 1.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 20);
  rim.position.set(-1.2, 3, -3);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a938a, 6);
  scene.add(hemi);

  // Always-on low ambient: with the room light off the scene stays a readable
  // dim silhouette (never full black), and placed lamps carry the mood.
  const ambientFloor = new THREE.AmbientLight(0xffffff, 7);
  scene.add(ambientFloor);

  // 태양(key)은 이 목록에 없다 — 시간대가 쥔다.
  const roomLights = [fill, rim, hemi];
  const baseIntensity = roomLights.map((l) => l.intensity);
  let on = true;
  let time: TimeOfDay = 'DAY';
  // 부팅 기본은 "창문 있음" — `setSunWindow`를 안 부르는 관리자 발광 프리뷰가 종전과
  // 같은 중립 주간 조명을 받는다. 시뮬레이터는 applyRoom이 항상 실제 창문 상태를 싣는다.
  let sunWindowOn = true;

  function apply(): void {
    // `visible` 토글은 광원 집합을 바꿔 셰이더 재빌드를 부른다 → 세기 0으로만 끈다
    // (235). key는 야간·창문 없음에도 castShadow=true인 채 세기만 0이다.
    key.intensity = time === 'DAY' && sunWindowOn ? SUN_INTENSITY : 0;
    roomLights.forEach((l, i) => (l.intensity = on ? baseIntensity[i] : 0));
    const scale = time === 'DAY' ? 1 : NIGHT_ENV_SCALE;
    scene.environmentIntensity = (on ? 10 : 1.0) * scale;
    scene.backgroundIntensity = (on ? 20 : 3.0) * scale;
  }

  apply();

  return {
    setRoomLight(next: boolean): boolean {
      on = next;
      apply();
      return next;
    },
    roomOn: () => on,
    setTimeOfDay(next: TimeOfDay): void {
      time = next;
      apply();
    },
    setSunWindow(side: WallSide | null): void {
      sunWindowOn = side !== null;
      // 방향은 위치로만 정한다(target은 방 중심 고정) — 위치·세기 둘 다 유니폼이라
      // 셰이더 재빌드가 없다. null이면 방향은 마지막 값 그대로 두고 세기만 0이다.
      if (side) key.position.set(...SUN_POSITIONS[side]);
      apply();
    },
    sunOn: () => time === 'DAY' && sunWindowOn,
  };
}
