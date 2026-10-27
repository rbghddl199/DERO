// 추천어 드롭다운의 키보드 이동 규칙 — useSearchSuggestions의 순수 부분(DERO-385).

import { describe, expect, it } from 'vitest';
import { nextHighlight } from '@/hooks/useSearchSuggestions';

describe('nextHighlight', () => {
  it('아래로 누르면 첫 항목부터 차례로 짚는다', () => {
    expect(nextHighlight(-1, 1, 3)).toBe(0);
    expect(nextHighlight(0, 1, 3)).toBe(1);
    expect(nextHighlight(1, 1, 3)).toBe(2);
  });

  it('마지막에서 아래로 누르면 입력한 글자로 돌아온다(-1)', () => {
    expect(nextHighlight(2, 1, 3)).toBe(-1);
  });

  it('아무것도 안 짚은 상태에서 위로 누르면 마지막 항목을 짚는다', () => {
    expect(nextHighlight(-1, -1, 3)).toBe(2);
    expect(nextHighlight(0, -1, 3)).toBe(-1);
  });

  it('목록이 비면 짚을 자리가 없다 — 어느 방향이든 -1', () => {
    expect(nextHighlight(-1, 1, 0)).toBe(-1);
    expect(nextHighlight(-1, -1, 0)).toBe(-1);
  });
});
