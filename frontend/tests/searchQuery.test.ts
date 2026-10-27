// 검색어 정규화 — '#'을 프론트에서만 한 번 떼는 규칙의 가드(DERO-492).

import { describe, expect, it } from 'vitest';
import { normalizeSearchQuery } from '@/utils/searchQuery';

describe('normalizeSearchQuery', () => {
  it('선행 #을 하나만 뗀다 — 서버도 떼면 ##태그가 깨진다', () => {
    expect(normalizeSearchQuery('#원목데스크')).toBe('원목데스크');
    expect(normalizeSearchQuery('##태그')).toBe('#태그');
  });

  it('앞뒤 공백을 지우고, 중간의 #은 건드리지 않는다', () => {
    expect(normalizeSearchQuery('  게이밍 ')).toBe('게이밍');
    expect(normalizeSearchQuery('모니터 #암')).toBe('모니터 #암');
  });

  it('빈 입력은 빈 문자열이다 — API 계층이 q 자체를 안 싣는 기준값', () => {
    expect(normalizeSearchQuery('   ')).toBe('');
  });
});
