// 코치마크 투어 스텝 머신 — 단계 표 계약, 시작 게이트, 다음·종료 전이, 라벨, 앵커 폴백을 검증한다.

import { describe, expect, it } from 'vitest';

import { SIMULATOR_TOUR_STEPS } from '@/constants/simulatorTour';
import {
  advanceTour,
  endTour,
  isLastStep,
  resolveStepRect,
  shouldStartTour,
  stepButtonLabel,
  stepCounterLabel,
  TOUR_STEP_COUNT,
  type TourSession,
} from '@/utils/simulatorTour';
import type { Rect } from '@/utils/simulatorTourGeometry';

const RECT: Rect = { x: 10, y: 20, width: 64, height: 64 };
const session = (overrides: Partial<TourSession> = {}): TourSession => ({
  active: true,
  stepIndex: 0,
  seen: false,
  ...overrides,
});

describe('단계 표 계약', () => {
  it('핵심 6단계를 확정된 순서로 갖는다', () => {
    expect(TOUR_STEP_COUNT).toBe(6);
    expect(SIMULATOR_TOUR_STEPS.map((step) => step.id)).toEqual([
      'canvas',
      'library',
      'save',
      'wall',
      'camera',
      'estimate',
    ]);
  });

  it('모든 단계가 문구와 앵커 후보를 갖는다', () => {
    for (const step of SIMULATOR_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.testIds.length).toBeGreaterThan(0);
    }
  });

  it('문구는 느낌표를 쓰지 않는다(DESIGN-SYSTEM §5 평서형)', () => {
    for (const step of SIMULATOR_TOUR_STEPS) {
      expect(step.title).not.toContain('!');
      expect(step.body).not.toContain('!');
    }
  });
});

describe('shouldStartTour', () => {
  it('아직 안 본 사용자에게만 시작한다', () => {
    expect(shouldStartTour({ seen: false, active: false, hydrated: true })).toBe(true);
  });

  it('persist 복원 전에는 시작하지 않는다 — 재방문자에게 1프레임 번쩍임이 생긴다', () => {
    expect(shouldStartTour({ seen: false, active: false, hydrated: false })).toBe(false);
  });

  it('이미 봤거나 이미 진행 중이면 시작하지 않는다', () => {
    expect(shouldStartTour({ seen: true, active: false, hydrated: true })).toBe(false);
    expect(shouldStartTour({ seen: false, active: true, hydrated: true })).toBe(false);
  });
});

describe('advanceTour', () => {
  it('중간 단계는 다음으로 넘어가고 seen을 남기지 않는다', () => {
    expect(advanceTour(session({ stepIndex: 0 }), TOUR_STEP_COUNT)).toEqual({
      active: true,
      stepIndex: 1,
      seen: false,
    });
  });

  it('마지막 단계에서 부르면 완료 처리한다', () => {
    expect(advanceTour(session({ stepIndex: TOUR_STEP_COUNT - 1 }), TOUR_STEP_COUNT)).toEqual({
      active: false,
      stepIndex: 0,
      seen: true,
    });
  });

  it('비활성 세션에는 아무 일도 하지 않는다(클릭·ESC 이중 발화 가드)', () => {
    const inactive = session({ active: false, stepIndex: 0, seen: true });
    expect(advanceTour(inactive, TOUR_STEP_COUNT)).toBe(inactive);
  });
});

describe('endTour', () => {
  it('어느 단계에서 끝내도 seen을 남긴다(건너뛰기·ESC 공통)', () => {
    for (let i = 0; i < TOUR_STEP_COUNT; i += 1) {
      expect(endTour(session({ stepIndex: i }))).toEqual({
        active: false,
        stepIndex: 0,
        seen: true,
      });
    }
  });

  it('비활성 세션에는 아무 일도 하지 않는다', () => {
    const inactive = session({ active: false, seen: true });
    expect(endTour(inactive)).toBe(inactive);
  });
});

describe('라벨', () => {
  it('마지막 단계만 완료를 보여준다', () => {
    expect(isLastStep(4, TOUR_STEP_COUNT)).toBe(false);
    expect(isLastStep(5, TOUR_STEP_COUNT)).toBe(true);
    expect(stepButtonLabel(0, TOUR_STEP_COUNT)).toBe('다음');
    expect(stepButtonLabel(4, TOUR_STEP_COUNT)).toBe('다음');
    expect(stepButtonLabel(5, TOUR_STEP_COUNT)).toBe('완료');
  });

  it('카운터는 1부터 센다', () => {
    expect(stepCounterLabel(0, TOUR_STEP_COUNT)).toBe('1 / 6');
    expect(stepCounterLabel(5, TOUR_STEP_COUNT)).toBe('6 / 6');
  });
});

describe('resolveStepRect', () => {
  it('첫 후보를 찾으면 그걸 쓴다', () => {
    const result = resolveStepRect(['estimate-panel', 'estimate-fold'], (id) =>
      id === 'estimate-panel' ? RECT : null,
    );
    expect(result).toEqual(RECT);
  });

  it('견적서가 접혀 estimate-panel이 없으면 원형 배지로 폴백한다', () => {
    const result = resolveStepRect(['estimate-panel', 'estimate-fold'], (id) =>
      id === 'estimate-fold' ? RECT : null,
    );
    expect(result).toEqual(RECT);
  });

  it('폭·높이가 0인 후보는 없는 것으로 본다', () => {
    const result = resolveStepRect(['estimate-panel'], () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }));
    expect(result).toBeNull();
  });

  it('후보가 전부 없으면 null이다', () => {
    expect(resolveStepRect(['estimate-panel', 'estimate-fold'], () => null)).toBeNull();
  });
});
