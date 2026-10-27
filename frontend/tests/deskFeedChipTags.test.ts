// 해시태그 칩 순서 규칙 — 빈도 내림차순, 동률은 ㄱㄴㄷ.
import { describe, expect, it } from 'vitest';

import { rankHashtags } from '@/utils/deskFeedChipTags';

describe('rankHashtags', () => {
  it('등장 글 수가 많은 태그를 앞에 세운다', () => {
    const counts = new Map([
      ['파랑', 1],
      ['데스크테리어', 12],
      ['키보드', 5],
    ]);

    expect(rankHashtags(counts)).toEqual(['데스크테리어', '키보드', '파랑']);
  });

  it('동률은 ㄱㄴㄷ으로 갈라 순서가 흔들리지 않는다', () => {
    const counts = new Map([
      ['키보드', 3],
      ['개발', 3],
      ['블랙', 3],
    ]);

    expect(rankHashtags(counts)).toEqual(['개발', '블랙', '키보드']);
  });

  it('빈 입력은 빈 배열이다', () => {
    expect(rankHashtags(new Map())).toEqual([]);
  });
});
