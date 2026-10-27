// 선택 툴바 위치 계산 — 앵커 기준 배치와 뷰포트 클램프(특히 상단바 회피)를 검증한다.

import { describe, expect, it } from 'vitest';

import {
  ANCHOR_GAP_PX,
  EDGE_MARGIN_PX,
  TOP_LIMIT_PX,
  clampToolbarPos,
} from '@/utils/selectionToolbarPos';

const VP = { vw: 1920, vh: 1080 };
const SIZE = { w: 330, h: 40 };

describe('clampToolbarPos', () => {
  it('화면 중앙 앵커는 앵커 위 중앙에 그대로 얹는다', () => {
    const { left, top } = clampToolbarPos({ x: 960, y: 540 }, SIZE, VP);
    expect(left).toBe(960 - SIZE.w / 2);
    expect(top).toBe(540 - SIZE.h - ANCHOR_GAP_PX);
  });

  it('앵커가 화면 최상단이면 상단바 아래(84px)에 붙는다', () => {
    const { top } = clampToolbarPos({ x: 960, y: 0 }, SIZE, VP);
    expect(top).toBe(TOP_LIMIT_PX);
  });

  it('앵커가 화면 위로 벗어나도(음수) 상단 한계를 지킨다', () => {
    const { top } = clampToolbarPos({ x: 960, y: -400 }, SIZE, VP);
    expect(top).toBe(TOP_LIMIT_PX);
  });

  it('좌우 끝에서도 툴바 전체가 뷰포트 안에 남는다', () => {
    expect(clampToolbarPos({ x: 0, y: 540 }, SIZE, VP).left).toBe(EDGE_MARGIN_PX);
    expect(clampToolbarPos({ x: 1920, y: 540 }, SIZE, VP).left).toBe(
      VP.vw - EDGE_MARGIN_PX - SIZE.w,
    );
  });

  it('앵커가 화면 아래로 벗어나도 하단 여백을 지킨다', () => {
    const { top } = clampToolbarPos({ x: 960, y: 2000 }, SIZE, VP);
    expect(top).toBe(VP.vh - EDGE_MARGIN_PX - SIZE.h);
  });

  it('툴바가 뷰포트보다 넓으면 잘리더라도 왼쪽 여백을 우선한다', () => {
    const { left } = clampToolbarPos({ x: 200, y: 540 }, { w: 800, h: 40 }, { vw: 400, vh: 300 });
    expect(left).toBe(EDGE_MARGIN_PX);
  });

  it('뷰포트가 상단 한계보다 낮아도 상단바를 침범하지 않는다', () => {
    const { top } = clampToolbarPos({ x: 200, y: 60 }, SIZE, { vw: 400, vh: 100 });
    expect(top).toBe(TOP_LIMIT_PX);
  });
});
