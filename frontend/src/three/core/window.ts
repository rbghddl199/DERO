// 창문 개구부 순수 규칙 — 슬롯→mm 변환·벽 지오메트리(진짜 구멍)·주 창문 선정·창문 자리 벽걸이 퇴거 (ADR-0030 결정 5·6·7)
//
// 창문은 벽 지오메트리에 실제로 뚫는 구멍이다(`Shape` + `holes`) — raycast가 구멍을
// 통과하므로 벽걸이 배치가 자동으로 창문을 피하고, 판정 코드는 0줄이다. 알파 마스크
// 개구부·"창문 사각형 배치 금지 구역" 안은 부결됐다(ADR-0030 기각 표).
import * as THREE from 'three/webgpu';
import { mmToM } from './units';
import type { WallSide } from './snap';

/** 저장 컬럼 `placement_wall.window_*_mm`과 같은 값 공간 — 전부 mm 정수다.
 *  `centerXMm`은 **벽 메쉬 중심 기준, 그 벽을 바라봤을 때 오른쪽이 +** 인 부호 있는
 *  오프셋이다(세 면 모두 지오메트리 로컬 +x와 일치 — scene.ts의 벽 회전이 그렇게 세워져
 *  있다). `centerYMm`은 바닥 기준 중심 높이. UI는 유한 슬롯이지만 저장이 mm라 나중에
 *  자유 배치로 열 때 스키마 변경이 없다(ADR-0030 결정 6). */
export interface WallWindowConfig {
  readonly centerXMm: number;
  readonly centerYMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** 창턱 높이(mm) — v1 고정. 자유로 열면 창문이 책상을 관통하는 조합이 생긴다(결정 6). */
export const WINDOW_SILL_MM = 900;

export type WindowSizeKey = 'STANDARD' | 'WIDE';

/** 크기 2종 (mm). 스탠다드 1200×1400 · 와이드 1800×1400 (ADR-0030 결정 6). */
export const WINDOW_SIZES: Readonly<Record<WindowSizeKey, { widthMm: number; heightMm: number }>> =
  {
    STANDARD: { widthMm: 1200, heightMm: 1400 },
    WIDE: { widthMm: 1800, heightMm: 1400 },
  };

export type WindowSlotKey = 'LEFT' | 'CENTER' | 'RIGHT';

export const WINDOW_SLOT_KEYS: readonly WindowSlotKey[] = ['LEFT', 'CENTER', 'RIGHT'];

/** 슬롯 간격(mm) — 좌·우 슬롯이 기준점에서 벌어지는 거리. 전면 벽(±1550mm 방)에서
 *  와이드 창(±900mm)이 코너를 안 넘는 최대치다. */
const WINDOW_SLOT_SPACING_MM = 600;

/**
 * 면별 슬롯 기준점(mm, 벽 메쉬 중심 기준 로컬 x). 전면 벽은 메쉬 중심 = 방 중심이라 0.
 * 좌·우 벽은 메쉬가 방보다 훨씬 넓고(5.5m) 방의 실사용 구간이 열린 쪽(카메라 방향)에
 * 치우쳐 있어, 기준점을 그쪽으로 800mm 민다 — 좌 벽은 로컬 +x가 전면 코너 방향(-z)이므로
 * 부호가 갈린다.
 */
const WINDOW_SLOT_BASE_MM: Readonly<Record<WallSide, number>> = {
  left: -800,
  front: 0,
  right: 800,
};

/** 슬롯의 수평 중심(mm) — 슬롯→mm(`windowConfigForSlot`)과 mm→슬롯(`windowSlotOf`)이
 *  **이 한 함수**를 쓴다. 정·역이 따로 살면 슬롯 기하를 한쪽만 고쳤을 때 방금 쓴 값이
 *  역산에 실패해 칩이 조용히 꺼진다. */
export function slotCenterXMm(side: WallSide, slot: WindowSlotKey): number {
  const offset =
    slot === 'CENTER' ? 0 : slot === 'LEFT' ? -WINDOW_SLOT_SPACING_MM : WINDOW_SLOT_SPACING_MM;
  return WINDOW_SLOT_BASE_MM[side] + offset;
}

/** 슬롯 하나를 저장 mm 값으로 편다. UI가 이 값을 그대로 저장하므로 슬롯 판별
 *  (`windowSlotOf`)은 정확 일치로 답한다. */
export function windowConfigForSlot(
  side: WallSide,
  slot: WindowSlotKey,
  size: WindowSizeKey,
): WallWindowConfig {
  const { widthMm, heightMm } = WINDOW_SIZES[size];
  return {
    centerXMm: slotCenterXMm(side, slot),
    centerYMm: WINDOW_SILL_MM + heightMm / 2,
    widthMm,
    heightMm,
  };
}

/** 저장 mm → 슬롯 역산. 슬롯 밖 값(원격에서 온 자유 mm)은 null — UI는 그때 슬롯 칩을
 *  안 켜고 창문 존재만 표시한다. */
export function windowSlotOf(side: WallSide, win: WallWindowConfig): WindowSlotKey | null {
  return WINDOW_SLOT_KEYS.find((slot) => slotCenterXMm(side, slot) === win.centerXMm) ?? null;
}

/** 슬롯 클릭 한 번의 결과 — **위치만** 슬롯으로 옮기고 크기·창턱(하단)은 보존한다.
 *  자유 mm 크기로 저장된 창문(원격 데이터)의 기하를 슬롯 클릭이 지우면 안 된다.
 *  창문이 없던 면은 표준 크기로 새로 낸다. */
export function windowAtSlot(
  side: WallSide,
  slot: WindowSlotKey,
  current: WallWindowConfig | null,
): WallWindowConfig {
  if (!current) return windowConfigForSlot(side, slot, 'STANDARD');
  return { ...current, centerXMm: slotCenterXMm(side, slot) };
}

/** 크기 클릭 한 번의 결과 — **크기만** 바꾸고 수평 위치·창턱(하단)은 보존한다.
 *  창턱 고정 규칙(결정 6)에 맞춰 중심이 아니라 하단을 붙든다. */
export function windowWithSize(current: WallWindowConfig, size: WindowSizeKey): WallWindowConfig {
  const { widthMm, heightMm } = WINDOW_SIZES[size];
  const sillMm = current.centerYMm - current.heightMm / 2;
  return { centerXMm: current.centerXMm, centerYMm: sillMm + heightMm / 2, widthMm, heightMm };
}

export function windowSizeOf(win: WallWindowConfig): WindowSizeKey | null {
  return (
    (Object.keys(WINDOW_SIZES) as WindowSizeKey[]).find(
      (k) => WINDOW_SIZES[k].widthMm === win.widthMm && WINDOW_SIZES[k].heightMm === win.heightMm,
    ) ?? null
  );
}

/** 벽 로컬 좌표(m)의 창문 사각형 — `alongM`은 벽 메쉬 중심 기준(보는 방향 오른쪽 +),
 *  `yM`은 바닥 기준. 지오메트리 구멍과 퇴거 판정이 같은 값을 쓴다. */
export interface WindowRectM {
  readonly alongMinM: number;
  readonly alongMaxM: number;
  readonly yMinM: number;
  readonly yMaxM: number;
}

/** 창문이 벽 밖으로 나가지 않게 민다(0.05m 여유) — 벽보다 넓은 창은 벽 크기로 줄인다.
 *  슬롯 유한 집합에서는 항상 안쪽이지만, 저장이 mm라 임의 값이 올 수 있다. */
export function windowRectM(
  win: WallWindowConfig,
  wallWidthM: number,
  wallHeightM: number,
): WindowRectM {
  const MARGIN = 0.05;
  const halfW = Math.min(mmToM(win.widthMm), wallWidthM - MARGIN * 2) / 2;
  const halfH = Math.min(mmToM(win.heightMm), wallHeightM - MARGIN * 2) / 2;
  const cx = Math.min(
    Math.max(mmToM(win.centerXMm), -wallWidthM / 2 + MARGIN + halfW),
    wallWidthM / 2 - MARGIN - halfW,
  );
  const cy = Math.min(Math.max(mmToM(win.centerYMm), MARGIN + halfH), wallHeightM - MARGIN - halfH);
  return {
    alongMinM: cx - halfW,
    alongMaxM: cx + halfW,
    yMinM: cy - halfH,
    yMaxM: cy + halfH,
  };
}

/**
 * 벽 평면 지오메트리 — 창문이 없으면 `PlaneGeometry`, 있으면 `Shape` + `holes`로 진짜
 * 구멍을 뚫는다(ADR-0030 결정 5). 두 경우 모두 로컬 좌표가 중심 원점·XY 평면·+z 법선으로
 * 같아서 마감 셰이더(`positionLocal` 기반)가 구분하지 못한다. 벽 지오메트리 소유권은
 * 씬이다 — 마감 모듈이 부르지 않는다.
 */
export function buildWallGeometry(
  widthM: number,
  heightM: number,
  hole: WindowRectM | null,
): THREE.BufferGeometry {
  if (!hole) return new THREE.PlaneGeometry(widthM, heightM);
  const shape = new THREE.Shape();
  shape.moveTo(-widthM / 2, -heightM / 2);
  shape.lineTo(widthM / 2, -heightM / 2);
  shape.lineTo(widthM / 2, heightM / 2);
  shape.lineTo(-widthM / 2, heightM / 2);
  shape.closePath();
  const rect = new THREE.Path();
  // 지오메트리 y는 중심 기준이라 바닥 기준 y에서 벽 높이 절반을 내린다.
  rect.moveTo(hole.alongMinM, hole.yMinM - heightM / 2);
  rect.lineTo(hole.alongMaxM, hole.yMinM - heightM / 2);
  rect.lineTo(hole.alongMaxM, hole.yMaxM - heightM / 2);
  rect.lineTo(hole.alongMinM, hole.yMaxM - heightM / 2);
  rect.closePath();
  shape.holes.push(rect);
  return new THREE.ShapeGeometry(shape);
}

/** 주 창문 = 켜져 있고 창문이 있는 면 중 전면 > 좌 > 우 (ADR-0030 결정 7). 없으면 null —
 *  햇살 세기 0(광원은 그대로 존재). 사용자가 고르는 UI는 만들지 않는다. */
export function primaryWindowSide(
  hasWindow: Readonly<Record<WallSide, boolean>>,
  wallOn: Readonly<Record<WallSide, boolean>>,
): WallSide | null {
  return (['front', 'left', 'right'] as const).find((s) => wallOn[s] && hasWindow[s]) ?? null;
}

/** 퇴거한 아이템이 창문 모서리에서 이만큼 물러난다(m). */
const WINDOW_EVICT_MARGIN_M = 0.01;

/**
 * 벽걸이 아이템이 창문 뒤에 남지 않게 미는 수평 좌표. **퇴거 판정 기준은 아이템
 * 중심**이다 — 포인터 부착이 중심 레이캐스트라(구멍은 중심이 못 들어간다) 같은 기준이라야
 * 부착 가능/불가능 집합이 일관된다. 중심이 사각형 밖이면 null(그대로 둔다 — 사용자가
 * 경계 밖에 직접 붙인 것), 안이면 가까운 수평 모서리 밖으로 **몸 전체가 창문을 벗어나게**
 * 민 along을 돌려준다(자동 배치·창문 이동의 결과라 절반 걸친 모습이 남으면 안 된다).
 */
export function evictAlongFromWindow(
  alongM: number,
  halfAlongM: number,
  centerYM: number,
  rect: WindowRectM,
): number | null {
  return evictAlongCandidates(alongM, halfAlongM, centerYM, rect)?.[0] ?? null;
}

/** 퇴거 후보 두 개 — [가까운 모서리 밖, 반대쪽 모서리 밖]. 벽 코너 클램프가 첫 후보를
 *  다시 창문 안으로 밀어 넣을 수 있어(코너에 붙은 창문) 호출부가 순서대로 시도한다. */
export function evictAlongCandidates(
  alongM: number,
  halfAlongM: number,
  centerYM: number,
  rect: WindowRectM,
): [number, number] | null {
  const insideX = alongM > rect.alongMinM && alongM < rect.alongMaxM;
  const insideY = centerYM > rect.yMinM && centerYM < rect.yMaxM;
  if (!insideX || !insideY) return null;
  const low = rect.alongMinM - halfAlongM - WINDOW_EVICT_MARGIN_M;
  const high = rect.alongMaxM + halfAlongM + WINDOW_EVICT_MARGIN_M;
  return alongM - rect.alongMinM <= rect.alongMaxM - alongM ? [low, high] : [high, low];
}
