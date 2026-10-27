// 코치마크 투어의 순수 스텝 머신 — 시작 게이트·다음·종료·라벨·앵커 해석.
// DOM과 zustand를 모른다(앵커 조회는 query 함수로 주입받는다) — 그래서 node 환경에서 테스트된다.

import { SIMULATOR_TOUR_STEPS } from '@/constants/simulatorTour';
import type { Rect } from '@/utils/simulatorTourGeometry';

export type TourSession = {
  active: boolean;
  stepIndex: number;
  /** 한 번이라도 끝(완료·건너뛰기·ESC)까지 간 사용자인지 — 이 값만 localStorage에 남는다. */
  seen: boolean;
};

export const TOUR_STEP_COUNT = SIMULATOR_TOUR_STEPS.length;

/**
 * 첫 입장 여부 판정. `hydrated`가 false면 시작하지 않는다 — persist 복원이 Promise라
 * 기다리지 않으면 재방문자에게도 1프레임 동안 1단계가 번쩍인다.
 */
export const shouldStartTour = (input: {
  seen: boolean;
  active: boolean;
  hydrated: boolean;
}): boolean => input.hydrated && !input.seen && !input.active;

/** 마지막 단계에서 부르면 완료 처리 — seen을 남기고 닫는다. */
export const advanceTour = (session: TourSession, stepCount: number): TourSession => {
  if (!session.active) return session;
  const next = session.stepIndex + 1;
  if (next >= stepCount) return { active: false, stepIndex: 0, seen: true };
  return { active: true, stepIndex: next, seen: session.seen };
};

/** 건너뛰기·ESC·완료 공통 종료 경로 — 어느 단계에서 끝내도 다시 뜨지 않는다. */
export const endTour = (session: TourSession): TourSession => {
  if (!session.active) return session;
  return { active: false, stepIndex: 0, seen: true };
};

export const isLastStep = (stepIndex: number, stepCount: number): boolean =>
  stepIndex >= stepCount - 1;

export const stepButtonLabel = (stepIndex: number, stepCount: number): string =>
  isLastStep(stepIndex, stepCount) ? '완료' : '다음';

export const stepCounterLabel = (stepIndex: number, stepCount: number): string =>
  `${stepIndex + 1} / ${stepCount}`;

/**
 * 앵커 후보를 우선순위 순으로 조회해 첫 번째로 찾은 rect를 돌려준다.
 * 폭·높이가 0인 결과는 없는 것으로 본다 — 구멍을 0으로 그리면 화면이 통째로 딤이 된다.
 */
export const resolveStepRect = (
  testIds: readonly string[],
  query: (testId: string) => Rect | null,
): Rect | null => {
  for (const testId of testIds) {
    const rect = query(testId);
    if (rect && rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
};
