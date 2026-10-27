'use client';
// 코치마크 투어의 말풍선 — 좌표·문구를 props로만 받는 순수 표시 컴포넌트(위치 계산은 부모).
// .glass를 쓰지 않는다: 3D 씬 위 가독성 + backdrop-filter 패널 상한(DESIGN-SYSTEM §2.3).

import type { CSSProperties, Ref } from 'react';
import type { BubblePlacement } from '@/utils/simulatorTourGeometry';

type Props = {
  titleId: string;
  title: string;
  body: string;
  counter: string;
  buttonLabel: string;
  placement: BubblePlacement;
  onNext: () => void;
  /** 부모가 실제 높이를 실측해 말풍선 방향을 다시 계산한다 — position:fixed라 래퍼로는 못 잰다. */
  bubbleRef?: Ref<HTMLDivElement>;
};

const CoachBubble = ({
  titleId,
  title,
  body,
  counter,
  buttonLabel,
  placement,
  onNext,
  bubbleRef,
}: Props) => {
  // 커스텀 프로퍼티는 React CSSProperties 타입에 없어 캐스트가 필요하다(.joint-slider의 --fill과 동일).
  const style = {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    '--coach-arrow': placement.arrowOffsetPx === null ? undefined : `${placement.arrowOffsetPx}px`,
  } as CSSProperties;

  return (
    <div
      ref={bubbleRef}
      className="sim-coach-bubble"
      data-side={placement.side}
      data-testid="coach-bubble"
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <p className="sim-coach-title" id={titleId}>
        {title}
      </p>
      <p className="sim-coach-body">{body}</p>
      <div className="sim-coach-footer">
        <span className="sim-coach-count" data-testid="coach-counter">
          {counter}
        </span>
        {/* 전파를 끊는다 — 오버레이 루트도 onClick={next}라 버블링되면 한 클릭에 2단계 진행된다. */}
        <button
          type="button"
          className="sim-coach-next"
          data-testid="coach-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};

export default CoachBubble;
