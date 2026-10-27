// 숫자 입력 커밋 파싱 — 편집 중 문자열을 언제 값으로 받아들이고 언제 되돌리는지의 계약.
// 회귀: 벽 거리 입력이 키 입력마다 커밋해 값을 지우는 순간 Number('')===0이 최소값으로
// 튀었다(DERO-552, 선택 툴바는 2026-08-03에 같은 함정을 이미 고쳤다).
import { describe, expect, it } from 'vitest';

import { commitDraft } from '@/utils/numericInput';

describe('commitDraft', () => {
  it('빈 문자열은 값이 아니다 — Number("")===0이 최소값으로 튀는 자리다', () => {
    expect(commitDraft('', 1, 3000)).toBeNull();
    expect(commitDraft('   ', 1, 3000)).toBeNull();
  });

  it('숫자가 아닌 중간 입력도 되돌린다', () => {
    expect(commitDraft('-', 1, 3000)).toBeNull();
    expect(commitDraft('9e', 1, 3000)).toBeNull();
    expect(commitDraft('abc', 1, 3000)).toBeNull();
  });

  it('범위를 벗어난 값은 클램프한다', () => {
    expect(commitDraft('0', 1, 3000)).toBe(1);
    expect(commitDraft('99999', 1, 3000)).toBe(3000);
    expect(commitDraft('-500', 1, 3000)).toBe(1);
  });

  it('정상 값은 그대로 통과한다', () => {
    expect(commitDraft('900', 1, 3000)).toBe(900);
    expect(commitDraft(' 1550 ', 1, 3000)).toBe(1550);
  });
});
