// 창밖 포털·개구부 마감·블라인드 계약(DERO-520) — ADR-0031
//
// 룩은 사람이 판정한다(박동규 시각 판정). 여기서 지는 것은 **기계가 답할 수 있는 계약**뿐이다:
// 시간 축이 유니폼 하나인가, 판이 개구부에 딱 맞는가(= 밖에서 판이 안 보인다), 색이 블룸
// 경로(emissive)에 실렸는가, 돌출이 20mm 캡 아래인가, 판정 레이캐스트에서 빠졌는가.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three/webgpu';
import { windowConfigForSlot, windowRectM } from '../src/three/core/window';
import { WALL_HEIGHT_M } from '../src/three/core/snap';
import { MAX_RELIEF_PROTRUSION_M } from '../src/three/finishes/types';
import { buildWindowView } from '../src/three/scene/windowView';
import { buildWindowTrim, WINDOW_TRIM_MAX_PROTRUSION_M } from '../src/three/scene/windowTrim';
import { buildBlind, BLIND_MAX_PROTRUSION_M } from '../src/three/scene/blind';
import {
  advanceWindowTime,
  setWindowNight,
  windowNightValue,
  windowTimeValue,
} from '../src/three/render/windowNodes';

const FRONT_W = 6.2; // 씬의 전면 벽 폭(scene.ts)
const RECT = windowRectM(
  windowConfigForSlot('front', 'CENTER', 'STANDARD'),
  FRONT_W,
  WALL_HEIGHT_M,
);
const WIDE = windowRectM(windowConfigForSlot('front', 'CENTER', 'WIDE'), FRONT_W, WALL_HEIGHT_M);

/** 벽 로컬 y(중심 기준) — 창문 사각형은 바닥 기준이라 씬과 같은 변환을 여기서도 쓴다. */
const toLocalY = (y: number): number => y - WALL_HEIGHT_M / 2;

describe('시간·시간대는 유니폼 두 개다 (재빌드 없는 애니메이션)', () => {
  beforeEach(() => {
    setWindowNight(false);
  });

  it('tick이 초 단위로 시간 유니폼을 올린다', () => {
    const before = windowTimeValue();
    advanceWindowTime(0.25);
    expect(windowTimeValue()).toBeCloseTo(before + 0.25, 6);
  });

  it('NaN·Infinity는 유니폼을 오염시키지 않는다 — 한 번 NaN이면 영원히 정지 화면이다', () => {
    advanceWindowTime(1);
    const before = windowTimeValue();
    advanceWindowTime(Number.NaN);
    advanceWindowTime(Number.POSITIVE_INFINITY);
    expect(windowTimeValue()).toBe(before);
  });

  it('접지 않는다 — 어디서 접어도 구름이 순간이동하고 별 위상이 튄다', () => {
    const before = windowTimeValue();
    advanceWindowTime(3600);
    advanceWindowTime(3600);
    expect(windowTimeValue()).toBeCloseTo(before + 7200, 3);
  });

  it('시간대는 0/1 유니폼이다 — 재질을 다시 짓지 않는 것이 이 축의 전부다', () => {
    setWindowNight(true);
    expect(windowNightValue()).toBe(1);
    setWindowNight(false);
    expect(windowNightValue()).toBe(0);
  });
});

describe('창밖 포털 (ADR-0031 결정 1·2)', () => {
  it('창 사각형과 정확히 같은 크기로 개구부에 끼워진다 — 여백이 있으면 위·바깥 시점에서 판이 보인다', () => {
    for (const rect of [RECT, WIDE]) {
      const view = buildWindowView(rect, WALL_HEIGHT_M, 1);
      const box = new THREE.Box3().setFromObject(view);
      expect(box.min.x).toBeCloseTo(rect.alongMinM, 6);
      expect(box.max.x).toBeCloseTo(rect.alongMaxM, 6);
      expect(box.min.y).toBeCloseTo(toLocalY(rect.yMinM), 6);
      expect(box.max.y).toBeCloseTo(toLocalY(rect.yMaxM), 6);
    }
  });

  it('벽면과 사실상 같은 평면이다 — 셋백이 크면 스침각에서 개구부 안에 판 가장자리가 들어온다', () => {
    const view = buildWindowView(RECT, WALL_HEIGHT_M, 1);
    expect(view.position.z).toBeLessThan(0); // 방 안으로는 한 뼘도 안 나온다
    expect(Math.abs(view.position.z)).toBeLessThan(0.01);
  });

  it('색이 두 슬롯에 갈려 실린다 — 하늘만 emissive(블룸), 지면·건물·나무는 colorNode', () => {
    const material = buildWindowView(RECT, WALL_HEIGHT_M, 1).material as THREE.Material & {
      emissiveNode?: unknown;
      colorNode?: unknown;
      color: THREE.Color;
    };
    expect(material.emissiveNode).toBeTruthy();
    // **두 슬롯을 다 쓴다** — 하늘·켜진 창만 emissive로 보내 번지게 하고, 지면·건물·나무는
    // colorNode로 또렷하게 낸다. 전부 emissive면 문턱 0인 블룸이 그림 전체를 흐려 더한다.
    expect(material.colorNode).toBeTruthy();
    // 알베도가 검다 — colorNode가 최종색이라 material.color는 안 섞이지만, 슬롯이 비면
    // 검은 판이 되는 것이 옳다(색이 두 번 더해지는 것보다 낫다).
    expect(material.color.getHex()).toBe(0x000000);
  });

  it('레이캐스트에서 빠진다 — 개구부는 벽걸이 배치가 통과해야 하는 구멍이다', () => {
    const view = buildWindowView(RECT, WALL_HEIGHT_M, 1);
    view.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, view.position.y, 3),
      new THREE.Vector3(0, 0, -1),
    );
    expect(ray.intersectObject(view, true)).toHaveLength(0);
  });

  it('그림자를 주고받지 않는다 — 창밖은 실내 조명 리그의 대상이 아니다', () => {
    const view = buildWindowView(RECT, WALL_HEIGHT_M, 1);
    expect(view.castShadow).toBe(false);
    expect(view.receiveShadow).toBe(false);
  });

  it('GLB가 아니라 절차 지오메트리다 — 창밖 소품과 사용자 배치 제품이 구분돼야 한다', () => {
    expect(buildWindowView(RECT, WALL_HEIGHT_M, 1).geometry).toBeInstanceOf(THREE.PlaneGeometry);
  });
});

describe('개구부 마감 — 창틀·창턱·밸런스 (ADR-0031 결정 3)', () => {
  it('돌출이 20mm 부조 캡을 안 넘는다', () => {
    expect(WINDOW_TRIM_MAX_PROTRUSION_M).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M);
    const box = new THREE.Box3().setFromObject(buildWindowTrim(RECT, WALL_HEIGHT_M));
    expect(box.max.z).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M);
  });

  it('구멍 가장자리를 사방에서 덮는다 — 두께 0 모서리 노출이 반려 사유였다', () => {
    const box = new THREE.Box3().setFromObject(buildWindowTrim(RECT, WALL_HEIGHT_M));
    expect(box.min.x).toBeLessThan(RECT.alongMinM);
    expect(box.max.x).toBeGreaterThan(RECT.alongMaxM);
    expect(box.min.y).toBeLessThan(toLocalY(RECT.yMinM)); // 창턱
    expect(box.max.y).toBeGreaterThan(toLocalY(RECT.yMaxM)); // 창틀 머리 + 밸런스
  });

  it('벽 윗변을 안 넘는다 — 방에 천장이 없어 벽 위로 나간 마감은 공중에 뜬다', () => {
    // 저장이 자유 mm라 원격 값은 벽 꼭대기까지 올라온다(windowRectM은 창문만 50mm 접는다).
    const high = windowRectM(
      { centerXMm: 0, centerYMm: 2500, widthMm: 1200, heightMm: 1400 },
      FRONT_W,
      WALL_HEIGHT_M,
    );
    for (const rect of [WIDE, high]) {
      const box = new THREE.Box3().setFromObject(buildWindowTrim(rect, WALL_HEIGHT_M));
      expect(box.max.y).toBeLessThanOrEqual(WALL_HEIGHT_M / 2 + 1e-6);
      // 잘려도 개구부 윗변은 여전히 덮어야 한다.
      expect(box.max.y).toBeGreaterThan(toLocalY(rect.yMaxM));
    }
  });

  it('유리판은 없다 — 블라인드가 상시 덮어 픽셀로 안 보이는데 반사 비용만 낸다', () => {
    for (const o of buildWindowTrim(RECT, WALL_HEIGHT_M).children) {
      expect((o as THREE.Mesh).geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(((o as THREE.Mesh).material as THREE.Material).transparent).toBe(false);
    }
  });

  it('밸런스가 블라인드 헤드레일을 앞에서 덮는다 — 창틀 위에 얹으면 뜬 흰 박스가 된다', () => {
    const trim = buildWindowTrim(RECT, WALL_HEIGHT_M);
    const rail = buildBlind(RECT, WALL_HEIGHT_M).children.find(
      (o) => !(o as THREE.InstancedMesh).isInstancedMesh,
    ) as THREE.Mesh;
    const railBox = new THREE.Box3().setFromObject(rail);
    const covers = trim.children.some((o) => {
      const b = new THREE.Box3().setFromObject(o);
      // 개구부 안 같은 높이대에 있고, 헤드레일보다 방 쪽으로 더 나와 있어야 가린다.
      return b.min.y <= railBox.min.y && b.max.y >= railBox.max.y && b.max.z > railBox.max.z;
    });
    expect(covers).toBe(true);
  });

  it('충돌·호환 판정에 안 들어간다 — 그룹 전체가 raycast 무력화다', () => {
    const trim = buildWindowTrim(RECT, WALL_HEIGHT_M);
    trim.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(trim, true)).toHaveLength(0);
  });
});

describe('블라인드 (ADR-0031 결정 4)', () => {
  it('돌출이 20mm 부조 캡을 안 넘는다 — 기운 슬랫도 포함이다', () => {
    expect(BLIND_MAX_PROTRUSION_M).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M);
    const box = new THREE.Box3().setFromObject(buildBlind(RECT, WALL_HEIGHT_M));
    expect(box.max.z).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M);
  });

  it('위에서 절반쯤만 내려온다 — 아래는 창밖이 그대로 보인다', () => {
    const blind = buildBlind(RECT, WALL_HEIGHT_M);
    const slats = blind.children.find(
      (o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh,
    )!;
    // 피치 22mm — 절반만 내려와도 수십 장이라 드로우콜을 아끼려 인스턴싱이다.
    expect(slats.count).toBeGreaterThan(10);
    const winH = RECT.yMaxM - RECT.yMinM;
    const box = new THREE.Box3().setFromObject(blind);
    expect(box.max.y).toBeGreaterThan(toLocalY(RECT.yMaxM) - 0.05); // 헤드레일은 개구부 맨 위
    // 바텀레일 아래로는 아무것도 없다. **화면 기준 1/3**이 목표이고 창 윗변 37%는 HUD 툴바
    // 뒤라(three/CLAUDE.md 함정 ③) 물리 비율은 그보다 커야 한다 — 절반은 넘고 2/3는 안 넘는다.
    const covered = toLocalY(RECT.yMaxM) - box.min.y;
    expect(covered).toBeGreaterThan(winH * 0.38);
    expect(covered).toBeLessThan(winH * 0.55);
  });

  it('와이드 창이면 슬랫도 같이 넓어진다 — 크기 2종이 한 상수에 안 잠겨 있다', () => {
    const width = (rect: typeof RECT): number =>
      new THREE.Box3().setFromObject(buildBlind(rect, WALL_HEIGHT_M)).getSize(new THREE.Vector3())
        .x;
    expect(width(WIDE)).toBeGreaterThan(width(RECT));
  });

  it('개구부 안에 들어간다 — 창틀 밖으로 삐져나오면 창에 달린 것으로 안 읽힌다', () => {
    const box = new THREE.Box3().setFromObject(buildBlind(RECT, WALL_HEIGHT_M));
    expect(box.min.x).toBeGreaterThanOrEqual(RECT.alongMinM);
    expect(box.max.x).toBeLessThanOrEqual(RECT.alongMaxM);
  });

  it('충돌·호환 판정에 안 들어간다 — 그룹 전체가 raycast 무력화다', () => {
    const blind = buildBlind(RECT, WALL_HEIGHT_M);
    blind.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.6, 3), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(blind, true)).toHaveLength(0);
  });

  it('GLB가 아니라 절차 지오메트리다', () => {
    for (const o of buildBlind(RECT, WALL_HEIGHT_M).children) {
      expect((o as THREE.Mesh).geometry).toBeInstanceOf(THREE.BoxGeometry);
    }
  });
});
