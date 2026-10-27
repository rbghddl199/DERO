'use client';
// 첫 입장 코치마크 투어 오버레이 — 전체 딤 + 현재 단계 대상만 뚫은 스포트라이트 + 말풍선.
// 오버레이 아무 곳 클릭 = 다음, 우상단 건너뛰기 · ESC = 즉시 종료(둘 다 seen 기록).
// SimHud의 !isFullscreen 블록 안에 있어야 한다(전체 화면에선 대상 6곳이 전부 사라진다).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  SIMULATOR_TOUR_STEPS,
  TOUR_ARROW_SIZE_PX,
  TOUR_BUBBLE_CORNER_PX,
  TOUR_BUBBLE_FALLBACK_HEIGHT_PX,
  TOUR_BUBBLE_GAP_PX,
  TOUR_BUBBLE_WIDTH_PX,
  TOUR_SPOTLIGHT_PAD_PX,
  TOUR_VIEWPORT_EDGE_PX,
  type CoachStepId,
} from '@/constants/simulatorTour';
import { useSimulatorTourStore } from '@/store/simulatorTourStore';
import {
  resolveStepRect,
  shouldStartTour,
  stepButtonLabel,
  stepCounterLabel,
  TOUR_STEP_COUNT,
} from '@/utils/simulatorTour';
import {
  computeBubblePlacement,
  insetRect,
  padRect,
  type Rect,
} from '@/utils/simulatorTourGeometry';
import CoachBubble from './CoachBubble';

const TITLE_ID = 'sim-coach-title';

const queryRect = (testId: string): Rect | null => {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};

const subscribeHydration = (onStoreChange: () => void): (() => void) =>
  useSimulatorTourStore.persist.onFinishHydration(onStoreChange);

const findTarget = (testIds: readonly string[]): Element | null => {
  for (const testId of testIds) {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (el) return el;
  }
  return null;
};

const SimulatorCoachTour = () => {
  const active = useSimulatorTourStore((s) => s.active);
  const stepIndex = useSimulatorTourStore((s) => s.stepIndex);
  const seen = useSimulatorTourStore((s) => s.seen);

  // persist 복원은 Promise다 — 끝나기 전에 시작하면 재방문자에게 1단계가 한 프레임 번쩍인다.
  // 외부 스토어(zustand persist)의 복원 완료를 구독으로 읽는다(이펙트 안 setState 회피).
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => useSimulatorTourStore.persist.hasHydrated(),
    () => false,
  );
  // 어느 단계를 잰 결과인지 함께 들고 있어야 "아직 못 잼"과 "대상이 없음"이 구분된다 —
  // 이펙트는 rAF·ResizeObserver 콜백보다 먼저 도는데, rect만 null로 두면 첫 측정 전에
  // 자동 건너뛰기가 발동해 1단계가 그냥 사라진다.
  const [measured, setMeasured] = useState<{ stepId: CoachStepId; rect: Rect | null } | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(TOUR_BUBBLE_FALLBACK_HEIGHT_PX);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  // 대상을 못 찾아 자동으로 건너뛴 횟수 — 전 단계가 없으면 무한 루프 대신 투어를 닫는다.
  const skippedRef = useRef(0);

  useEffect(() => {
    if (!shouldStartTour({ seen, active, hydrated })) return;
    useSimulatorTourStore.getState().start();
  }, [seen, active, hydrated]);

  const step = active ? SIMULATOR_TOUR_STEPS[stepIndex] : undefined;

  const measure = useCallback(() => {
    if (!step) return;
    const rect = resolveStepRect(step.testIds, queryRect);
    if (!rect) {
      setMeasured({ stepId: step.id, rect: null });
      return;
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setMeasured({
      stepId: step.id,
      rect: padRect(insetRect(rect, step.insetRatio), TOUR_SPOTLIGHT_PAD_PX, viewport),
    });
  }, [step]);

  // 이번 단계를 실제로 잰 결과만 쓴다 — 단계가 바뀐 직후의 옛 좌표로 구멍을 그리지 않는다.
  const hole = step && measured?.stepId === step.id ? measured.rect : null;

  // 첫 측정은 ResizeObserver가 observe() 즉시 한 번 콜백을 쏘는 것으로 받는다(이펙트 본문에서
  // measure를 직접 부르면 렌더 중 setState가 된다). 이후 재측정은 뷰포트 변화와 대상 자체의
  // 크기 변화(견적 목록이 길어지는 등)뿐이다 — 매 프레임 rAF 루프는 만들지 않는다(루프 주인은
  // RenderLoop 하나). rAF 한 번은 레이아웃이 안정된 다음 프레임을 위한 보정이고, 대상을 아예
  // 못 찾은 경우(관측할 엘리먼트가 없다)의 유일한 진입점이기도 하다.
  useLayoutEffect(() => {
    if (!step) return;
    window.addEventListener('resize', measure);
    const target = findTarget(step.testIds);
    const observer = target ? new ResizeObserver(measure) : null;
    observer?.observe(target as Element);
    const raf = requestAnimationFrame(measure);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure, step]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    setBubbleHeight(el.getBoundingClientRect().height || TOUR_BUBBLE_FALLBACK_HEIGHT_PX);
  }, [step, hole]);

  // 대상이 아예 없는 단계(에셋 로드 실패 등)는 조용히 넘긴다. 측정을 실제로 시도한 뒤에만
  // 판정한다 — measured.stepId가 이번 단계여야 한다.
  useEffect(() => {
    if (!step || measured?.stepId !== step.id || measured.rect !== null) return;
    if (skippedRef.current >= TOUR_STEP_COUNT) {
      useSimulatorTourStore.getState().end();
      return;
    }
    skippedRef.current += 1;
    console.warn('[SimulatorCoachTour] 대상 요소를 찾지 못해 이 단계를 건너뜁니다', step.id);
    useSimulatorTourStore.getState().next();
  }, [measured, step]);

  // ESC는 capture 단계에서 잡고 전파를 끊는다 — 나가기 다이얼로그의 ESC와 겹치지 않게.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      useSimulatorTourStore.getState().end();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [active]);

  if (!active || !step || !hole) return null;

  const placement = computeBubblePlacement({
    hole,
    bubble: { width: TOUR_BUBBLE_WIDTH_PX, height: bubbleHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    preferred: step.preferredSide,
    gapPx: TOUR_BUBBLE_GAP_PX,
    edgePx: TOUR_VIEWPORT_EDGE_PX,
    arrowSizePx: TOUR_ARROW_SIZE_PX,
    cornerPx: TOUR_BUBBLE_CORNER_PX,
  });

  const next = () => useSimulatorTourStore.getState().next();

  return (
    <div
      className="hud sim-coach-root"
      data-testid="sim-coach-tour"
      onClick={next}
      aria-live="polite"
    >
      <div
        className="sim-coach-hole"
        data-testid="coach-spotlight"
        style={{
          left: `${hole.x}px`,
          top: `${hole.y}px`,
          width: `${hole.width}px`,
          height: `${hole.height}px`,
        }}
      />
      <button
        type="button"
        className="sim-coach-skip"
        data-testid="coach-skip"
        onClick={(e) => {
          e.stopPropagation();
          useSimulatorTourStore.getState().end();
        }}
      >
        건너뛰기
      </button>
      <CoachBubble
        titleId={TITLE_ID}
        title={step.title}
        body={step.body}
        counter={stepCounterLabel(stepIndex, TOUR_STEP_COUNT)}
        buttonLabel={stepButtonLabel(stepIndex, TOUR_STEP_COUNT)}
        placement={placement}
        onNext={next}
        bubbleRef={bubbleRef}
      />
    </div>
  );
};

export default SimulatorCoachTour;
