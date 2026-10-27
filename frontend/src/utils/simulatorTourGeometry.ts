// 코치마크 투어의 순수 기하 계산 — 스포트라이트 구멍 rect와 말풍선 배치(방향·좌표·화살표 오프셋).
// DOM을 모른다(호출부가 getBoundingClientRect 결과를 Rect로 넘긴다) — 그래서 node 환경에서 테스트된다.

import type { CoachSide } from '@/constants/simulatorTour';

export type Rect = { x: number; y: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type BubbleSize = { width: number; height: number };

export type BubblePlacement = {
  side: CoachSide;
  left: number;
  top: number;
  /** 말풍선 시작점 기준 화살표 위치(px). `center`(화살표 없음)면 null. */
  arrowOffsetPx: number | null;
};

export type BubblePlacementInput = {
  hole: Rect;
  bubble: BubbleSize;
  viewport: Viewport;
  preferred: CoachSide;
  gapPx: number;
  edgePx: number;
  arrowSizePx: number;
  cornerPx: number;
};

const clamp = (value: number, min: number, max: number): number => {
  // max < min(말풍선이 뷰포트보다 큰 경우)이면 min을 택한다 — 음수 좌표보다 잘리는 쪽이 낫다.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

/** 대상 rect를 안쪽으로 ratio만큼 줄인다(사방 균등). 뷰포트 전체를 덮는 캔버스 단계용. */
export const insetRect = (rect: Rect, ratio: number): Rect => {
  const dx = rect.width * ratio;
  const dy = rect.height * ratio;
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width - dx * 2,
    height: rect.height - dy * 2,
  };
};

/** 사방에 pad를 더한 뒤 뷰포트 안으로 클램프한다. */
export const padRect = (rect: Rect, padPx: number, viewport: Viewport): Rect => {
  const left = Math.max(rect.x - padPx, 0);
  const top = Math.max(rect.y - padPx, 0);
  const right = Math.min(rect.x + rect.width + padPx, viewport.width);
  const bottom = Math.min(rect.y + rect.height + padPx, viewport.height);
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
};

export const oppositeSide = (side: CoachSide): CoachSide => {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return 'center';
};

/** preferred → 반대편 → 교차축 두 방향 순으로 시도한다. */
const candidateSides = (preferred: CoachSide): readonly CoachSide[] => {
  if (preferred === 'center') return ['center'];
  const isHorizontal = preferred === 'left' || preferred === 'right';
  const cross: readonly CoachSide[] = isHorizontal ? ['bottom', 'top'] : ['right', 'left'];
  return [preferred, oppositeSide(preferred), ...cross];
};

/** 그 방향에 놓았을 때의 주축 시작 좌표(클램프 전). */
const primaryStart = (side: CoachSide, input: BubblePlacementInput): number => {
  const { hole, bubble, gapPx } = input;
  if (side === 'right') return hole.x + hole.width + gapPx;
  if (side === 'left') return hole.x - gapPx - bubble.width;
  if (side === 'bottom') return hole.y + hole.height + gapPx;
  return hole.y - gapPx - bubble.height;
};

export const computeBubblePlacement = (input: BubblePlacementInput): BubblePlacement => {
  const { hole, bubble, viewport, preferred, edgePx, arrowSizePx, cornerPx } = input;

  if (preferred === 'center') {
    return {
      side: 'center',
      left: clamp(
        hole.x + hole.width / 2 - bubble.width / 2,
        edgePx,
        viewport.width - bubble.width - edgePx,
      ),
      top: clamp(
        hole.y + hole.height / 2 - bubble.height / 2,
        edgePx,
        viewport.height - bubble.height - edgePx,
      ),
      arrowOffsetPx: null,
    };
  }

  const sides = candidateSides(preferred);
  const fits = sides.find((side) => {
    const isHorizontal = side === 'left' || side === 'right';
    const start = primaryStart(side, input);
    const limit = isHorizontal
      ? viewport.width - bubble.width - edgePx
      : viewport.height - bubble.height - edgePx;
    // 클램프 없이 들어가는 후보만 "적합"으로 본다 — 클램프되면 화살표가 구멍을 못 가리킨다.
    return start >= edgePx && start <= limit;
  });
  const side = fits ?? preferred;
  const isHorizontal = side === 'left' || side === 'right';
  const start = primaryStart(side, input);

  const crossCenter = isHorizontal
    ? hole.y + hole.height / 2 - bubble.height / 2
    : hole.x + hole.width / 2 - bubble.width / 2;
  const crossSize = isHorizontal ? bubble.height : bubble.width;
  const crossViewport = isHorizontal ? viewport.height : viewport.width;
  const crossStart = clamp(crossCenter, edgePx, crossViewport - crossSize - edgePx);

  const holeCrossCenter = isHorizontal ? hole.y + hole.height / 2 : hole.x + hole.width / 2;
  const arrowOffsetPx = clamp(
    holeCrossCenter - crossStart,
    cornerPx + arrowSizePx,
    crossSize - cornerPx - arrowSizePx,
  );

  return {
    side,
    left: isHorizontal ? clamp(start, edgePx, viewport.width - bubble.width - edgePx) : crossStart,
    top: isHorizontal ? crossStart : clamp(start, edgePx, viewport.height - bubble.height - edgePx),
    arrowOffsetPx,
  };
};
