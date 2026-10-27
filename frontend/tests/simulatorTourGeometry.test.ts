// 코치마크 투어 기하 계산 — 구멍 rect(inset·pad)와 말풍선 배치(방향 뒤집기·클램프·화살표)를 검증한다.

import { describe, expect, it } from 'vitest';

import {
  computeBubblePlacement,
  insetRect,
  oppositeSide,
  padRect,
  type BubblePlacementInput,
} from '@/utils/simulatorTourGeometry';

const VIEWPORT = { width: 1920, height: 1080 };
const BUBBLE = { width: 288, height: 132 };

const baseInput = (
  overrides: Partial<BubblePlacementInput> & Pick<BubblePlacementInput, 'hole' | 'preferred'>,
): BubblePlacementInput => ({
  bubble: BUBBLE,
  viewport: VIEWPORT,
  gapPx: 14,
  edgePx: 16,
  arrowSizePx: 8,
  cornerPx: 12,
  ...overrides,
});

describe('insetRect', () => {
  it('ratio만큼 사방을 균등하게 줄인다', () => {
    const result = insetRect({ x: 0, y: 0, width: 1920, height: 1080 }, 0.14);
    expect(result.x).toBeCloseTo(268.8);
    expect(result.y).toBeCloseTo(151.2);
    expect(result.width).toBeCloseTo(1920 - 268.8 * 2);
    expect(result.height).toBeCloseTo(1080 - 151.2 * 2);
  });

  it('ratio 0은 항등이다', () => {
    const rect = { x: 20, y: 84, width: 56, height: 320 };
    expect(insetRect(rect, 0)).toEqual(rect);
  });
});

describe('padRect', () => {
  it('사방에 pad를 더한다', () => {
    const result = padRect({ x: 100, y: 200, width: 56, height: 320 }, 8, VIEWPORT);
    expect(result).toEqual({ x: 92, y: 192, width: 72, height: 336 });
  });

  it('뷰포트 밖으로 나가지 않게 클램프한다', () => {
    const left = padRect({ x: 0, y: 0, width: 40, height: 40 }, 8, VIEWPORT);
    expect(left.x).toBe(0);
    expect(left.y).toBe(0);
    expect(left.width).toBe(48);

    const right = padRect({ x: 1900, y: 1060, width: 20, height: 20 }, 8, VIEWPORT);
    expect(right.x + right.width).toBe(VIEWPORT.width);
    expect(right.y + right.height).toBe(VIEWPORT.height);
  });
});

describe('oppositeSide', () => {
  it('네 방향을 서로 뒤집고 center는 그대로 둔다', () => {
    expect(oppositeSide('top')).toBe('bottom');
    expect(oppositeSide('bottom')).toBe('top');
    expect(oppositeSide('left')).toBe('right');
    expect(oppositeSide('right')).toBe('left');
    expect(oppositeSide('center')).toBe('center');
  });
});

describe('computeBubblePlacement', () => {
  it('preferred가 들어가면 그 방향에 붙이고 구멍 중심에 맞춘다', () => {
    // 좌측 레일 버튼 — right가 항상 들어간다.
    const hole = { x: 12, y: 480, width: 64, height: 64 };
    const result = computeBubblePlacement(baseInput({ hole, preferred: 'right' }));

    expect(result.side).toBe('right');
    expect(result.left).toBe(hole.x + hole.width + 14);
    expect(result.top).toBe(hole.y + hole.height / 2 - BUBBLE.height / 2);
  });

  it('preferred가 안 들어가면 뒤집고, 음수 좌표를 내지 않는다', () => {
    // 우측 견적서 패널이 화면 오른쪽 끝에 있고 왼쪽 여백이 말풍선보다 좁은 경우.
    const hole = { x: 120, y: 100, width: 1780, height: 200 };
    const result = computeBubblePlacement(baseInput({ hole, preferred: 'left' }));

    expect(result.side).not.toBe('left');
    expect(result.left).toBeGreaterThanOrEqual(16);
    expect(result.top).toBeGreaterThanOrEqual(16);
  });

  it('어느 후보도 안 들어가면 preferred로 폴백하되 좌표를 클램프한다', () => {
    const viewport = { width: 700, height: 400 };
    const hole = { x: 0, y: 0, width: 700, height: 400 };
    const result = computeBubblePlacement(baseInput({ hole, preferred: 'right', viewport }));

    expect(result.side).toBe('right');
    expect(result.left).toBeGreaterThanOrEqual(16);
    expect(result.left).toBeLessThanOrEqual(viewport.width - BUBBLE.width - 16);
    expect(result.top).toBeGreaterThanOrEqual(16);
    expect(result.top).toBeLessThanOrEqual(viewport.height - BUBBLE.height - 16);
  });

  it('교차축도 뷰포트 안으로 클램프한다', () => {
    const hole = { x: 12, y: 4, width: 64, height: 20 };
    const result = computeBubblePlacement(baseInput({ hole, preferred: 'right' }));

    expect(result.side).toBe('right');
    expect(result.top).toBe(16);
  });

  it('화살표는 구멍 중심을 가리키고, 코너를 타지 않는 범위 안에 있다', () => {
    const hole = { x: 12, y: 480, width: 64, height: 64 };
    const centered = computeBubblePlacement(baseInput({ hole, preferred: 'right' }));
    expect(centered.arrowOffsetPx).toBeCloseTo(BUBBLE.height / 2);

    // 구멍이 화면 위 끝에 붙어 말풍선이 클램프된 경우 — 화살표만 위로 올라간다.
    const clamped = computeBubblePlacement(
      baseInput({ hole: { x: 12, y: 4, width: 64, height: 20 }, preferred: 'right' }),
    );
    const min = 12 + 8;
    const max = BUBBLE.height - 12 - 8;
    expect(clamped.arrowOffsetPx).not.toBeNull();
    expect(clamped.arrowOffsetPx as number).toBeGreaterThanOrEqual(min);
    expect(clamped.arrowOffsetPx as number).toBeLessThanOrEqual(max);
  });

  it('center는 구멍 가운데에 놓고 화살표가 없다', () => {
    const hole = { x: 268, y: 151, width: 1382, height: 777 };
    const result = computeBubblePlacement(baseInput({ hole, preferred: 'center' }));

    expect(result.side).toBe('center');
    expect(result.arrowOffsetPx).toBeNull();
    expect(result.left).toBeCloseTo(hole.x + hole.width / 2 - BUBBLE.width / 2);
    expect(result.top).toBeCloseTo(hole.y + hole.height / 2 - BUBBLE.height / 2);
  });
});
