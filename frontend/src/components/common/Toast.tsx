'use client';
// 하단 고정 토스트 — 북마크 저장 등 짧은 액션 피드백. 일정 시간 뒤 자동으로 사라지고, 액션 버튼 하나를 둘 수 있다.

import { useEffect, useState } from 'react';
import BodyPortal from './BodyPortal';

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 액션 글자색 — 북마크는 골드(기본값), 좋아요는 빨강처럼 액션의 성격에 맞는 색을 넘긴다 */
  actionColorClassName?: string;
  onDismiss: () => void;
  durationMs?: number;
};

const DEFAULT_DURATION_MS = 3000;
const DEFAULT_ACTION_COLOR_CLASS_NAME = 'text-primary-500';
/** className의 duration-300과 반드시 같은 값 — 퇴장 트랜지션이 끝날 시점을 타이머로 잡는다 */
const FADE_DURATION_MS = 300;

const Toast = ({
  message,
  actionLabel,
  onAction,
  actionColorClassName = DEFAULT_ACTION_COLOR_CLASS_NAME,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
}: Props) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), 10);
    // onDismiss를 바로 부르지 않고 isVisible을 먼저 내려 퇴장 트랜지션(FADE_DURATION_MS)을 재생한 뒤
    // 실제 언마운트(onDismiss)를 부른다 — 그래야 등장과 같은 페이드가 사라질 때도 재생된다.
    // onTransitionEnd 대신 고정 타이머를 쓰는 이유: 배경 탭(document.hidden)에서는 브라우저가
    // CSS 트랜지션을 건너뛰어 transitionend가 아예 발화하지 않을 수 있다.
    const hideTimer = setTimeout(() => setIsVisible(false), durationMs);
    const dismissTimer = setTimeout(onDismiss, durationMs + FADE_DURATION_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss, durationMs]);

  return (
    <BodyPortal>
      <div
        role="status"
        className={`bg-ink text-paper fixed inset-x-4 bottom-6 z-50 flex items-center justify-between gap-4 rounded-2xl px-5 py-4 text-[15px] shadow-lg transition-all duration-300 sm:inset-x-auto sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <span>{message}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={`${actionColorClassName} shrink-0 cursor-pointer font-medium`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </BodyPortal>
  );
};

export default Toast;
