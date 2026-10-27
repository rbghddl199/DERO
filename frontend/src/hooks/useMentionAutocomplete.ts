// 멘션 자동완성의 서버 왕복·선택 커서만 맡는다 — 트리거 감지와 토큰 삽입은 입력기(textarea·Tiptap)가
// 다르므로 호출부가 소유한다. 이 훅이 공유하는 것은 "무엇을 몇 개 어떤 순서로 보여주는가"뿐이다.
'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { searchUsers } from '@/api/user';
import type { UserSearchResultResponse } from '@/types/user';

/** 키 입력마다 치지 않는다 — 서버가 ES를 왕복하고, 사용자는 몇 글자를 이어 친다. */
const DEBOUNCE_MS = 200;

const EMPTY: readonly UserSearchResultResponse[] = [];

/**
 * 응답을 **그 응답을 부른 질의와 묶어** 들고 있는다. 안 묶으면 `@박`의 결과가 `@박서`를 치는 동안
 * 그대로 떠 있고, 그 사이 Enter를 누르면 <b>엉뚱한 사람이 조용히 멘션된다</b>. 화면에 내보낼지는
 * 아래에서 `query`와 대조해 정한다(이펙트에서 동기 setState를 하면 렌더가 연쇄된다 —
 * eslint react-hooks).
 */
type MentionResult = {
  query: string;
  items: readonly UserSearchResultResponse[];
  /** 503 — "0명"이 아니라 검색을 못 쓰는 상태다(폴백 없음, ADR-0019 결정 6). */
  unavailable: boolean;
};

type MentionAutocomplete = {
  candidates: readonly UserSearchResultResponse[];
  /** 방향키가 움직이는 커서. 후보가 새로 오면 0으로 돌아간다. */
  activeIndex: number;
  moveActive: (delta: number) => void;
  isUnavailable: boolean;
};

/**
 * @param query `null`이면 자동완성이 닫힌 상태다. 빈 문자열(`@`만 친 직후)도 서버를 부르지 않는다 —
 *        서버가 0자 질의를 400으로 막는다(그것이 곧 전체 사용자 목록이라서다).
 */
export function useMentionAutocomplete(query: string | null): MentionAutocomplete {
  const [result, setResult] = useState<MentionResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  /** 늦게 도착한 옛 질의의 응답이 새 후보를 덮어쓰지 않게 하는 표식. */
  const requestId = useRef(0);

  const isOpen = query !== null && query !== '';

  useEffect(() => {
    if (!isOpen) return;
    const issued = ++requestId.current;

    const timer = setTimeout(() => {
      searchUsers(query)
        .then((found) => {
          if (requestId.current !== issued) return;
          setResult({ query, items: found, unavailable: false });
          setActiveIndex(0);
        })
        .catch((error: unknown) => {
          if (requestId.current !== issued) return;
          console.error('[useMentionAutocomplete] 닉네임 후보를 불러오지 못했습니다', error);
          // **503만 "검색 불가"다.** 비로그인 401(댓글 폼은 로그아웃 상태에서도 그려진다)까지
          // 같은 문구로 묶으면 인증 문제를 장애로 말하게 된다.
          const unavailable = error instanceof ApiError && error.status === 503;
          setResult({ query, items: EMPTY, unavailable });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOpen, query]);

  // 지금 질의의 응답일 때만 화면에 나간다 — 닫혀 있거나 질의가 앞서 갔으면 아무것도 없다.
  const matched = isOpen && result !== null && result.query === query;
  const candidates = matched ? result.items : EMPTY;

  const moveActive = (delta: number) => {
    setActiveIndex((current) => {
      if (candidates.length === 0) return 0;
      return (current + delta + candidates.length) % candidates.length;
    });
  };

  return {
    candidates,
    activeIndex,
    moveActive,
    isUnavailable: matched && result.unavailable,
  };
}
