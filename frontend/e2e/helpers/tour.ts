// 첫 입장 코치마크 투어 시드 헬퍼 — 시뮬레이터 스펙들이 공유한다.
//
// Playwright 컨텍스트는 localStorage가 매번 비어 있어 모든 시뮬레이터 스펙이 "첫 입장"이다.
// 투어 오버레이는 뷰포트를 덮고 클릭을 다음 단계로 삼키므로, 투어 자체를 검증하는 스펙
// (simulator-tour.spec.ts)을 뺀 전부가 beforeEach에서 seedCoachTourSeen을 불러야 한다.
//
// import.meta 금지 — Next의 package.json에 "type": "module"이 없어 스펙이 CJS로 로드된다.

import type { Page } from '@playwright/test';

/** simulatorTourStore의 persist 키·봉투 구조와 같아야 한다(zustand persist: {state, version}). */
export const COACH_TOUR_STORAGE_KEY = 'dero-simulator-tour';
const SEEN_ENVELOPE = JSON.stringify({ state: { seen: true }, version: 1 });

/** 첫 내비게이션 **전에** 불러야 한다 — addInitScript는 이후 로드되는 문서에만 적용된다. */
export async function seedCoachTourSeen(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [COACH_TOUR_STORAGE_KEY, SEEN_ENVELOPE] as const,
  );
}

/** 이미 로드된 페이지에서 투어가 떠 있으면 건너뛴다 — 시드를 못 심은 경로의 구제책. */
export async function dismissCoachTour(page: Page): Promise<void> {
  const skip = page.getByTestId('coach-skip');
  if (await skip.isVisible()) await skip.click();
}

/** 저장된 seen 값을 읽는다 — 종료 경로(완료·건너뛰기·ESC)가 기록을 남겼는지 확인용. */
export async function readCoachTourSeen(page: Page): Promise<boolean> {
  const raw = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    COACH_TOUR_STORAGE_KEY,
  );
  if (!raw) return false;
  const parsed = JSON.parse(raw) as { state?: { seen?: boolean } };
  return parsed.state?.seen === true;
}
