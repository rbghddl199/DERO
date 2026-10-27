// 코치마크 말풍선의 마크업 계약 — 방향 속성·화살표 오프셋·문구·카운터·버튼 라벨·접근성 속성.
// vitest 환경이 node(jsdom 없음)라 renderToStaticMarkup으로 문자열을 검사한다(oauthComponents.test.ts와 같은 방식).

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CoachBubble from '@/components/simulator/CoachBubble';
import { SIMULATOR_TOUR_STEPS } from '@/constants/simulatorTour';
import { TOUR_STEP_COUNT, stepButtonLabel, stepCounterLabel } from '@/utils/simulatorTour';
import type { BubblePlacement } from '@/utils/simulatorTourGeometry';

const render = (placement: BubblePlacement, stepIndex: number) => {
  const step = SIMULATOR_TOUR_STEPS[stepIndex];
  return renderToStaticMarkup(
    createElement(CoachBubble, {
      titleId: 'sim-coach-title',
      title: step.title,
      body: step.body,
      counter: stepCounterLabel(stepIndex, TOUR_STEP_COUNT),
      buttonLabel: stepButtonLabel(stepIndex, TOUR_STEP_COUNT),
      placement,
      onNext: () => {},
    }),
  );
};

const SIDE_PLACEMENT: BubblePlacement = {
  side: 'right',
  left: 90,
  top: 480,
  arrowOffsetPx: 66,
};

describe('CoachBubble', () => {
  it('방향·좌표·화살표 오프셋을 인라인으로 싣는다', () => {
    const html = render(SIDE_PLACEMENT, 1);
    expect(html).toContain('data-side="right"');
    expect(html).toContain('left:90px');
    expect(html).toContain('top:480px');
    expect(html).toContain('--coach-arrow:66px');
  });

  it('제목·본문·카운터·다음 버튼을 보여준다', () => {
    const html = render(SIDE_PLACEMENT, 1);
    expect(html).toContain('제품 담기');
    expect(html).toContain('제품 목록이 열립니다');
    expect(html).toContain('2 / 6');
    expect(html).toContain('다음');
  });

  it('마지막 단계 버튼은 완료다', () => {
    const html = render(SIDE_PLACEMENT, TOUR_STEP_COUNT - 1);
    expect(html).toContain('6 / 6');
    expect(html).toContain('완료');
    expect(html).not.toContain('>다음<');
  });

  it('center 배치에는 화살표 오프셋이 없다', () => {
    const html = render({ side: 'center', left: 800, top: 470, arrowOffsetPx: null }, 0);
    expect(html).toContain('data-side="center"');
    expect(html).not.toContain('--coach-arrow');
  });

  it('대화상자 접근성 속성을 갖는다', () => {
    const html = render(SIDE_PLACEMENT, 1);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="sim-coach-title"');
    expect(html).toContain('id="sim-coach-title"');
  });
});
