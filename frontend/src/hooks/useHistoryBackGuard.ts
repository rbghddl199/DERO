'use client';
// 브라우저 "뒤로가기"를 감지해 확인을 물을 수 있게 하는 저수준 훅 — 확인 UI(네이티브 confirm,
// 커스텀 모달)는 호출부가 정한다.
//
// 그냥 popstate만 듣고 있으면 안 된다 — Next.js App Router가 자기 popstate 리스너를 앱 최상단
// (우리 컴포넌트보다 항상 먼저 마운트)에서 먼저 등록해 두고, 뒤로가기로 실제 URL이 바뀌면 우리
// 리스너가 불리기도 전에 새 라우트로 트리를 갈아치워 버린다. 그러면 우리 effect의 cleanup이
// 먼저 실행되어 리스너 자체가 사라지고 확인이 전혀 뜨지 않은 채 그대로 이동해버린다(실측 확인,
// 2026-08-XX — 콘솔에 "리스너 부착" 다음 곧장 "리스너 해제"만 찍히고 핸들러 자체가 안 불림).
//
// 그래서 활성화되는 즉시 현재 URL과 완전히 동일한 히스토리 엔트리를 하나 더 심어둔다(sentinel).
// 사용자가 뒤로가기를 누르면 이 sentinel만 pop되고 URL은 그대로라 Next 라우터가 아무 것도 다시
// 그리지 않는다 — 그래서 컴포넌트가 죽지 않고 살아남고, 우리 popstate 핸들러가 정상적으로 실행된다.

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * @param enabled 이 값이 true인 동안만 뒤로가기를 가로챈다.
 * @param onBackAttempt 사용자가 뒤로가기를 눌렀을 때 호출된다. `leave()`를 부르면 실제로 이전
 *   페이지로 이동하고, `stay()`를 부르면 sentinel을 다시 심어 같은 화면에 남는다. 확인 UI가
 *   비동기(모달 클릭 대기 등)여도 된다 — 둘 중 하나를 나중에 불러도 상관없다.
 * @param onLeave 지정하면 `leave()`가 진짜 이전 히스토리 엔트리(`history.back()`) 대신 이 함수를
 *   호출한다 — 뒤로가기로 나가도 항상 고정된 목적지로 보내야 하는 호출부용(예: 시뮬레이터
 *   나가기는 브라우저에 실제로 뭐가 있었든 항상 `/craft`로 간다). 이 경로는 `history.back()`을
 *   타지 않으므로 popstate가 다시 발생하지 않는다 — `isLeavingRef`의 "떠나는 중" 스킵이 필요 없다.
 */
export function useHistoryBackGuard(
  enabled: boolean,
  onBackAttempt: (leave: () => void, stay: () => void) => void,
  onLeave?: () => void,
): void {
  const isLeavingRef = useRef(false);
  const onBackAttemptRef = useRef(onBackAttempt);
  const onLeaveRef = useRef(onLeave);
  // 렌더 중 ref 대입 금지(React Compiler 린트) — 매 렌더 직후(페인트 전) 최신 콜백으로 갱신한다.
  useLayoutEffect(() => {
    onBackAttemptRef.current = onBackAttempt;
    onLeaveRef.current = onLeave;
  });

  useEffect(() => {
    if (!enabled) return;

    window.history.pushState(null, '', window.location.href);
    let sentinelActive = true;

    const leave = () => {
      const override = onLeaveRef.current;
      if (override) {
        // 실제 popstate를 일으키지 않는 이동(라우터 push, 하드 리다이렉트 등)이라
        // sentinel을 그냥 죽은 것으로 친다 — 남겨두면 언마운트 cleanup이 또 history.back()을 부른다.
        sentinelActive = false;
        override();
        return;
      }
      isLeavingRef.current = true;
      window.history.back();
    };
    const stay = () => {
      window.history.pushState(null, '', window.location.href);
      sentinelActive = true;
    };

    const handlePopState = () => {
      // '떠나기'로 실제 이동시키는 back()도 popstate를 한 번 더 발생시킨다 — 그 복구 이벤트까지
      // 다시 물으면 확인이 연속으로 뜨므로 그 한 번만 건너뛴다.
      if (isLeavingRef.current) {
        isLeavingRef.current = false;
        return;
      }
      sentinelActive = false;
      onBackAttemptRef.current(leave, stay);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // 뒤로가기가 아니라(저장 성공 등) enabled가 꺼지며 정리되는 경우 — 아직 안 걷어낸
      // sentinel이 남아있으면 여기서 걷어낸다. 안 걷어내면 나중에 다른 페이지로 이동했을 때
      // 뒤로가기를 여러 번 눌러야 하는 빈 화면 잔상 엔트리로 남는다. 이 훅이 꺼지는 시점과
      // 그 뒤에 이어지는 실제 이동(예: 저장 성공 후 router.push) 사이엔 보통 네트워크 왕복 같은
      // 실질적인 시간차가 있어 안전하다 — 다만 "같은 틱에서 곧장 이어지는 이동"과 경합하면
      // 그 이동 자체가 씹힐 수 있다(history.back() 직후 동기 pushState가 무시되는 실측 확인) —
      // 그런 즉시-이동 경로(나가기 버튼 클릭 등)는 이 자동 정리에 기대지 말고 직접 처리할 것.
      if (sentinelActive) {
        sentinelActive = false;
        window.history.back();
      }
    };
  }, [enabled]);
}
