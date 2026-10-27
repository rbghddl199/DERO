// 광원 슬롯 풀 — 램프 SpotLight·장식 발광 PointLight를 부팅 시 미리 만들어 두고 배치·삭제는 슬롯 파라미터만 갈아끼운다 (DERO-235)

import * as THREE from 'three/webgpu';
import { mmToM } from '../core/units';
import {
  colorTempToRGB,
  beamHalfAngleRad,
  penumbraFor,
  lampSlotOrder,
  LAMP_SHADOW_CAP,
  LAMP_LIGHT_SLOT_COUNT,
} from './lighting';
import { createCookieColorNode, type CookieColorNode } from '../render/cookieNode';
import {
  createCookieBaker,
  COOKIE_MASK_RES,
  WHITE_MASK_STATS,
  type CookieMaskStats,
} from '../render/cookieBake';

// 광원 개수와 `castShadow` 플래그 집합이 곧 three `LightsNode`의 셰이더 해시다
// (`LightsNode.js:156`) — 램프를 놓을 때마다 광원을 만들거나 캡 재배정으로 플래그를
// 토글하면 씬 전역 셰이더가 재빌드되고 실기 WebGPU에서 1.2~1.9초 멈춘다. 그래서 이
// 풀은 두 값을 부팅 시 확정하고 런타임에는 색·각도·세기·위치만 갈아끼운다. **어떤
// 경로에서도 `visible`을 만지면 안 된다** — 그것도 광원 집합 변경이다. 빈 슬롯은
// `power = 0`으로 끈다. 실측은 `frontend/qa-artifacts/light-slots/RESULTS.md`.

/** 슬롯에 실릴 램프 1개의 파라미터 — PlacedItem에 의존하지 않는 구조적 입력. */
export interface SlotLamp {
  /** 제품 규격 id — 쿠키 마스크 캐시 키다(같은 제품이면 갓 기하가 같아 한 번만 굽는다). */
  specId: string;
  /** 램프 그룹 — 매 프레임 월드 좌표를 여기서 읽어 슬롯 광원을 따라 붙인다. */
  group: THREE.Object3D;
  heightMm: number;
  lumens: number;
  colorTempK: number;
  distribution: 'spot' | 'flood' | 'ambient';
  reachMm: number;
}

/** 슬롯에 실릴 장식 발광 1개. 램프와 달리 그림자가 없고 색이 인스턴스 지배(ADR-0003). */
export interface SlotEmitter {
  /** 발광체가 달린 아이템 그룹 — 매 프레임 월드 변환을 아래 localPoint에 곱한다. */
  group: THREE.Object3D;
  /** 발광 위치(m, 아이템 그룹 로컬) — 매니페스트 `point` 또는 배치 시점 bbox 중심. */
  localPoint: THREE.Vector3;
  colorHex: number;
  radiusMm: number;
  lumens: number;
}

/** 슬롯 하나의 쿠키 상태 — QA·회귀 가드용 스냅샷 (`lightingInfo()`가 싣는다). */
export interface CookieSlotInfo {
  /** 지금 이 슬롯에 실린 제품 id. 빈 슬롯은 null이고 마스크는 흰색이다. */
  specId: string | null;
  /** 구워진 마스크가 실제로 이 슬롯에 실렸는지. false면 흰 마스크(= 쿠키 없음)다.
   *  베이크가 비동기라 배치 직후 몇 프레임은 false다 — 진행형 향상이라 정상 상태다. */
  maskApplied: boolean;
  /** 빔(내접원) 안 평균 통과율(0~1) — 화면에 실제로 나오는 무늬의 세기다. 흰 마스크는 1. */
  beamMean: number;
  /** 마스크 최소값(8비트). 갓이 완전히 덮은 자리의 값이라 `round(투과율 × 255)`여야 한다
   *  — 색 공간 변환이 끼면 이 값이 어긋난다(0.5 → 128, sRGB 변환이 끼면 188). */
  maskMin: number;
  /** 마스크 최대값(8비트). 톤매핑이 안 걸렸으면 흰 배경이 255로 구워진다. */
  maskMax: number;
  /** 셰이더 UV 회전 보정에 들어가는 요(rad) — 유니폼이라 이 값이 변해도 재빌드가 없다. */
  yawRad: number;
}

export interface LightSlotPool {
  /**
   * 램프 목록을 슬롯에 싣는다. 배정 순서는 `lampSlotOrder`(실효 lm 내림차순, 223).
   * 반환값은 입력과 같은 순서의 슬롯 광원이고, 슬롯을 못 받은 램프는 `undefined`다.
   */
  assignLamps(lamps: SlotLamp[]): (THREE.SpotLight | undefined)[];
  /**
   * 발광 목록을 슬롯에 싣는다. **이미 캡 이하로 골라진 목록**을 우선순위 순서로
   * 받는다(고르는 규칙은 카메라 근접순 — `emitterLightFlags`, 호출부 소관).
   */
  assignEmitters(emitters: SlotEmitter[]): (THREE.PointLight | undefined)[];
  /** 아이템이 움직이면(이동·드롭 트윈·관절) 슬롯 광원 좌표를 따라 붙인다. 매 프레임 호출. */
  sync(): void;
  /** 슬롯별 쿠키 상태 스냅샷(슬롯 순서 고정) + 지금까지 완료된 베이크 횟수. */
  cookieInfo(): { bakes: number; slots: CookieSlotInfo[] };
}

/** three r185의 `SpotLight.colorNode`(쿠키 경로, `SpotLightNode.js:142`)는 @types/three에
 *  선언이 없다 — 좁은 캐스트로만 붙인다. */
type CookieSpotLight = THREE.SpotLight & { colorNode: unknown };

/** 슬롯 하나가 들고 있는 쿠키 리소스. 텍스처·노드는 부팅 시 만들고 끝이다. */
interface CookieSlot {
  /** `mask.image.data` 그 자체 — 제자리에서 덮어쓴다(`.value` 교체 없음). */
  data: Uint8Array;
  mask: THREE.DataTexture;
  node: CookieColorNode;
  stats: CookieMaskStats;
  specId: string | null;
  yawRad: number;
  applied: boolean;
}

/** 슬롯 광원은 풀 루트(항등 변환)의 자식이라 좌표가 곧 월드 좌표다. */
export function createLightSlots(
  scene: THREE.Scene,
  emitterSlotCount: number,
  renderer: THREE.WebGPURenderer,
): LightSlotPool {
  const root = new THREE.Group();
  root.name = 'lightSlots';
  scene.add(root);

  // 쿠키 배선의 절대 제약 (235와 같은 축: `LightsNode.customCacheKey()`가 광원마다
  // `light.map.id`와 `light.colorNode.getCacheKey()`를 셰이더 해시에 넣는다 —
  // `LightsNode.js:147-175`). 그래서:
  //   1. `colorNode`는 **빈 슬롯 포함 6개 전부**에 부팅 시 단다. 있고 없고가 해시를 바꾼다.
  //   2. 런타임 재대입 금지. 슬롯당 `Fn` 하나를 만들고 끝이다.
  //   3. `light.map`은 6개 전부 영구히 null.
  //   4. 슬롯마다 **자기 DataTexture 인스턴스**를 준다 — `TextureNode.getUniformHash()`가
  //      `value.uuid`라 두 슬롯이 같은 텍스처로 빌드되면 유니폼 바인딩이 하나로 합쳐진다.
  //   5. 갱신은 `image.data` 제자리 덮어쓰기 + `needsUpdate`. 빈 슬롯의 마스크는 흰색이다.
  const baker = createCookieBaker(renderer);
  const cookies: CookieSlot[] = [];

  const lampSlots: THREE.SpotLight[] = [];
  for (let i = 0; i < LAMP_LIGHT_SLOT_COUNT; i++) {
    const s = new THREE.SpotLight(0xffffff);
    s.decay = 2; // physical inverse-square (SI) — 램프 경로와 같은 규약
    s.distance = 1;
    s.angle = beamHalfAngleRad('flood');
    s.penumbra = penumbraFor('flood');
    s.power = 0; // 빈 슬롯
    s.castShadow = i < LAMP_SHADOW_CAP; // 부팅 시 확정, 런타임 불변
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.camera.near = 0.05;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.02;
    s.position.set(0, 0.4, 0);
    s.target.position.set(0, 0, 0);

    const data = new Uint8Array(COOKIE_MASK_RES * COOKIE_MASK_RES * 4).fill(255);
    const mask = new THREE.DataTexture(
      data,
      COOKIE_MASK_RES,
      COOKIE_MASK_RES,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    mask.colorSpace = THREE.NoColorSpace;
    mask.minFilter = THREE.LinearFilter; // 밉맵 불필요 — 거리 블러는 226 ③ 기각이다
    mask.magFilter = THREE.LinearFilter;
    mask.wrapS = THREE.ClampToEdgeWrapping;
    mask.wrapT = THREE.ClampToEdgeWrapping;
    mask.needsUpdate = true;
    const node = createCookieColorNode(mask);
    (s as CookieSpotLight).colorNode = node.colorNode; // 부팅 시 1회 — 이후 절대 재대입 없음
    cookies.push({
      data,
      mask,
      node,
      stats: WHITE_MASK_STATS,
      specId: null,
      yawRad: 0,
      applied: false,
    });

    root.add(s);
    root.add(s.target);
    lampSlots.push(s);
  }

  const emitterSlots: THREE.PointLight[] = [];
  for (let i = 0; i < emitterSlotCount; i++) {
    const p = new THREE.PointLight(0xffffff);
    p.castShadow = false; // 그림자 캐스터 캡을 한 칸도 먹지 않는다 (ADR-0003)
    p.decay = 2;
    p.distance = 1;
    p.power = 0;
    root.add(p);
    emitterSlots.push(p);
  }

  const assignedLamps: { slot: THREE.SpotLight; lamp: SlotLamp; cookie: CookieSlot }[] = [];
  const assignedEmitters: { slot: THREE.PointLight; emitter: SlotEmitter }[] = [];
  const wp = new THREE.Vector3();

  /** 마스크를 흰색(= 쿠키 없음)으로 되돌린다. 슬롯이 비거나 다른 제품이 실릴 때 부른다 —
   *  안 그러면 다음에 실린 제품이 옛 마스크를 한 프레임 쓴다. */
  function clearMask(c: CookieSlot): void {
    c.data.fill(255);
    c.mask.needsUpdate = true;
    c.stats = WHITE_MASK_STATS;
    c.specId = null;
    c.yawRad = 0;
    c.applied = false;
  }

  function syncNow(): void {
    for (const a of assignedLamps) {
      a.lamp.group.getWorldPosition(wp);
      // 스팟은 갓 윗구멍(전구 소켓 자리), 타깃은 램프 밑동. 갓 정중앙이 아니다 — 여기여야
      // 갓 깊이 0.20이 확보돼 쿠키 차단각이 빔 안에 든다 (`props.ts` 갓 기하와 세트).
      a.slot.position.set(wp.x, wp.y + mmToM(a.lamp.heightMm) - 0.01, wp.z);
      a.slot.target.position.set(wp.x, wp.y, wp.z);
      // 쿠키 UV 프레임은 월드 고정이라(광원이 수직이라 lookAt이 degenerate) 램프를 돌려도
      // 무늬가 안 돈다 — 셰이더에서 UV를 반대로 돌려 상쇄한다. 유니폼이라 비용 0이다.
      a.cookie.yawRad = a.lamp.group.rotation.y;
      a.cookie.node.setYaw(a.cookie.yawRad);
    }
    for (const a of assignedEmitters) {
      a.emitter.group.updateWorldMatrix(true, false);
      a.slot.position.copy(a.emitter.localPoint).applyMatrix4(a.emitter.group.matrixWorld);
    }
  }

  return {
    assignLamps(lamps: SlotLamp[]): (THREE.SpotLight | undefined)[] {
      const order = lampSlotOrder(lamps.map((l) => l.lumens));
      const out: (THREE.SpotLight | undefined)[] = new Array(lamps.length).fill(undefined);
      assignedLamps.length = 0;
      for (let k = 0; k < lampSlots.length; k++) {
        const s = lampSlots[k];
        const c = cookies[k];
        const li = order[k];
        if (li === undefined) {
          s.power = 0;
          clearMask(c);
          continue;
        }
        const l = lamps[li];
        const rgb = colorTempToRGB(l.colorTempK);
        s.color.setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
        s.angle = beamHalfAngleRad(l.distribution);
        s.penumbra = penumbraFor(l.distribution);
        s.distance = mmToM(l.reachMm);
        s.shadow.camera.far = Math.max(s.distance, 0.5);
        s.power = l.lumens; // lm — 엔진이 cd로 환산
        if (c.specId !== l.specId) clearMask(c);
        assignedLamps.push({ slot: s, lamp: l, cookie: c });
        out[li] = s;
      }
      // 광원 좌표를 먼저 확정한다 — 베이크 카메라가 `spot.shadow.camera`라 광원이 제자리에
      // 있어야 UV 정본과 어긋나지 않는다.
      syncNow();
      for (const a of assignedLamps) {
        const cookie = a.cookie;
        const specId = a.lamp.specId;
        cookie.specId = specId;
        baker.request(specId, a.lamp.group, a.slot, (px, stats) => {
          // 베이크가 끝나기 전에 재배정이 나면 이 슬롯에 다른 제품이 실려 있을 수 있다.
          if (cookie.specId !== specId) return;
          cookie.data.set(px);
          cookie.mask.needsUpdate = true;
          cookie.stats = stats;
          cookie.applied = true;
        });
      }
      return out;
    },

    assignEmitters(emitters: SlotEmitter[]): (THREE.PointLight | undefined)[] {
      const out: (THREE.PointLight | undefined)[] = new Array(emitters.length).fill(undefined);
      assignedEmitters.length = 0;
      for (let k = 0; k < emitterSlots.length; k++) {
        const s = emitterSlots[k];
        const e = emitters[k];
        if (e === undefined) {
          s.power = 0;
          continue;
        }
        s.color.setHex(e.colorHex);
        s.distance = mmToM(e.radiusMm);
        s.power = e.lumens;
        assignedEmitters.push({ slot: s, emitter: e });
        out[k] = s;
      }
      syncNow();
      return out;
    },

    sync: syncNow,

    cookieInfo(): { bakes: number; slots: CookieSlotInfo[] } {
      return {
        bakes: baker.bakeCount(),
        slots: cookies.map((c) => ({
          specId: c.specId,
          maskApplied: c.applied,
          beamMean: c.stats.beamMean,
          maskMin: c.stats.min,
          maskMax: c.stats.max,
          yawRad: c.yawRad,
        })),
      };
    },
  };
}
