// 검색어 추천 드롭다운의 데이터·키보드 조작 — GET /products/suggestions(ADR-0019 결정 1의 요구 ③).
// 소비자가 둘이라(/product의 ProductGrid, 시뮬레이터의 LibraryPanel) 훅으로 뽑았다. 마크업은
// 두 화면의 디자인 체계가 달라(Tailwind vs HUD style.css) 각자 그린다 — 여기 있는 것은 화면이
// 갈려도 같아야 하는 것들뿐이다: 언제 서버를 치는가, 어떤 순서로 답이 도착해도 옳은가, 위/아래·
// Enter·Esc가 무엇을 하는가.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { getProductSuggestions } from '@/api/product';
import { isMockApi } from '@/constants/api';

/** 추천 조회를 늦추는 시간(ms). 목록 검색 디바운스(300)보다 짧다 — 드롭다운은 타이핑 중에
 *  따라와야 쓸모가 있고, 응답이 문자열 몇 개라 목록 조회보다 훨씬 싸다. */
const SUGGEST_DEBOUNCE_MS = 150;

/** 이 글자 수부터 추천을 친다. 한 글자에 걸리는 제품은 사실상 카탈로그 전체라 고를 값이 없다. */
const MIN_QUERY_LENGTH = 2;

/**
 * 위/아래 키가 짚는 자리를 옮긴다. `-1`은 "아무것도 안 짚음"이고 자리 하나로 함께 센다 —
 * 아래로 끝까지 내려가면 입력한 글자로 돌아온다(목록이 짧아 되짚는 것보다 감는 편이 빠르다).
 * 순수 함수라 테스트가 훅 없이 이 규칙만 본다(`tests/searchSuggestions.test.ts`).
 */
export function nextHighlight(previous: number, step: 1 | -1, count: number): number {
  const slots = count + 1;
  return ((previous + 1 + step + slots) % slots) - 1;
}

export interface SearchSuggestions {
  /** 드롭다운에 세울 문자열들. 닫혀 있으면 빈 배열이다 — 소비자는 length만 보고 그리면 된다. */
  items: string[];
  /** 키보드로 짚은 항목의 인덱스. -1이면 아무것도 안 짚었다(Enter가 원래 하던 일을 한다). */
  highlighted: number;
  /** 마우스 hover로 짚는 자리를 옮긴다 — 키보드와 같은 상태를 쓴다. */
  highlight: (index: number) => void;
  /**
   * 항목을 고르거나 입력창을 떠날 때. 같은 질의로는 다시 안 열린다.
   *
   * <b>고른 값으로 입력창을 채울 때는 그 값을 넘겨야 한다</b> — 안 넘기면 "지금 질의"를 닫는 것이라,
   * 곧이어 질의가 고른 값으로 바뀌는 순간 조건이 풀려 드롭다운이 도로 열린다.
   */
  close: (forQuery?: string) => void;
  /**
   * 입력창의 `onKeyDown`에 그대로 물린다. 위/아래로 짚고, Enter로 고르고, Esc로 닫는다.
   *
   * <b>고른 게 있을 때만 Enter를 가로챈다</b> — 아무것도 안 짚었으면 `false`를 돌려주므로 화면의
   * 원래 Enter 동작(검색 확정)이 그대로 돈다. 그래서 소비자는 `if (handled) return;` 한 줄만
   * 얹으면 된다.
   */
  onKeyDown: (event: KeyboardEvent, onPick: (value: string) => void) => boolean;
}

/**
 * @param query 입력창의 즉시값 — 디바운스는 이 훅이 한다.
 * @param enabled 꺼져 있으면 서버를 안 친다. mock 모드는 ES가 없으므로 자동으로 꺼진다.
 */
export function useSearchSuggestions(query: string, enabled = true): SearchSuggestions {
  const trimmed = query.trim();
  const active = enabled && !isMockApi();

  /** **어느 질의의 답인지까지 같이 들고 있는다.** 질의가 바뀐 순간 옛 추천어는 자동으로 안 보이므로
   *  이펙트가 목록을 비우려고 setState를 부를 일이 없다(그 형태는 `react-hooks/set-state-in-effect`
   *  위반이자 연쇄 렌더다). 짧은 질의·mock 모드도 같은 이유로 그냥 안 맞는 상태가 된다. */
  const [answer, setAnswer] = useState<{ query: string; items: string[] }>({
    query: '',
    items: [],
  });
  const [highlighted, setHighlighted] = useState(-1);
  /** 사용자가 닫아 버린 질의 — 같은 글자인 동안에는 다시 안 연다. */
  const [closedFor, setClosedFor] = useState<string | null>(null);
  /** 늦게 도착한 옛 응답이 새 응답을 덮어쓰지 않게 하는 표. abort 대신 이걸 쓰는 이유는
   *  apiClient가 signal을 안 받기 때문이고, 버리는 응답이 문자열 몇 개라 값도 싸다. */
  const requestId = useRef(0);

  useEffect(() => {
    if (!active || trimmed.length < MIN_QUERY_LENGTH) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      getProductSuggestions(trimmed)
        .then((items) => {
          if (id !== requestId.current) return;
          setAnswer({ query: trimmed, items });
          setHighlighted(-1);
        })
        .catch(() => {
          // 추천이 실패하는 것은 화면을 바꿀 일이 아니다 — 드롭다운이 안 뜰 뿐이고, ES가 죽었다는
          // 사실은 같은 화면의 검색 결과가 503 배너로 이미 말한다(ADR-0019 결정 6).
          if (id !== requestId.current) return;
          setAnswer({ query: trimmed, items: [] });
          setHighlighted(-1);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, active]);

  const close = useCallback(
    (forQuery?: string) => setClosedFor(forQuery === undefined ? trimmed : forQuery.trim()),
    [trimmed],
  );
  const highlight = useCallback((index: number) => setHighlighted(index), []);

  const open = answer.query === trimmed && answer.items.length > 0 && closedFor !== trimmed;
  // useCallback의 의존이라 렌더마다 새 배열이 되면 안 된다(exhaustive-deps 경고의 실체).
  const visible = useMemo(() => (open ? answer.items : []), [open, answer.items]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent, onPick: (value: string) => void): boolean => {
      if (event.key === 'Escape') {
        // 열려 있지 않아도 삼키지 않는다 — 모달·플라이아웃의 Esc를 가로채면 안 된다.
        if (!open) return false;
        setClosedFor(trimmed);
        return true;
      }
      if (!open) return false;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); // 커서가 입력 끝으로 튀는 기본 동작을 막는다
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlighted((prev) => nextHighlight(prev, step, visible.length));
        return true;
      }
      if (event.key === 'Enter' && highlighted >= 0 && highlighted < visible.length) {
        event.preventDefault();
        // 고른 값으로 닫는다 — 입력창이 곧 그 값이 되므로 "지금 질의"로 닫으면 도로 열린다.
        setClosedFor(visible[highlighted]);
        onPick(visible[highlighted]);
        return true;
      }
      return false;
    },
    [open, trimmed, visible, highlighted],
  );

  return { items: visible, highlighted, highlight, close, onKeyDown };
}
