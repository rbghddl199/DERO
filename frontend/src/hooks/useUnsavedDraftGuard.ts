'use client';

import { useEffect } from 'react';
import { useHistoryBackGuard } from './useHistoryBackGuard';

const LEAVE_MESSAGE = '작성 중인 내용이 있습니다. 변경 사항을 무시하고 나가시겠습니까?';
let activeDraftGuardCount = 0;

// 이동을 시도할 때마다 새로 묻는다. 취소한 이전 결정은 다음 이동 시도에 재사용하지 않는다.
export const confirmDiscardDraft = (): boolean => window.confirm(LEAVE_MESSAGE);

/** 공통 링크 전환기가 내부 이동을 시작하기 전에 호출한다. */
export const confirmNavigationIfDraft = (): boolean =>
  activeDraftGuardCount === 0 || confirmDiscardDraft();

/** 작성 중인 폼에서 링크, 새로고침, 브라우저 뒤로가기로 실수로 이탈하는 것을 막는다.
 *  뒤로가기 감지는 useHistoryBackGuard(히스토리 sentinel 기법 — 그 파일 상단 주석 참고)에
 *  맡기고, 여기선 "네이티브 confirm으로 묻는다"는 정책만 얹는다. */
export function useUnsavedDraftGuard(enabled: boolean): void {
  useHistoryBackGuard(enabled, (leave, stay) => {
    if (confirmDiscardDraft()) leave();
    else stay();
  });

  useEffect(() => {
    if (!enabled) return;
    activeDraftGuardCount += 1;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      activeDraftGuardCount = Math.max(0, activeDraftGuardCount - 1);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);
}
