// communityContent.ts의 평문 변환·표지 이미지 추출 계약 검증 — toPlainText는 PostCard/상세 페이지의
// 미리보기가 공유하므로, PostRichEditor가 저장하는 <u>/<span>/<p> 태그를 제대로 지워야 한다.
import { describe, expect, it } from 'vitest';
import {
  buildPlacementToken,
  extractFirstImageUrl,
  extractPlacementIds,
  splitContentByPlacementTokens,
  toPlainExcerpt,
} from '@/components/community/communityContent';

describe('communityContent', () => {
  it('toPlainExcerpt는 마크다운 기호를 지운다', () => {
    const content = `# 제목\n\n**굵게** [링크](https://x.com)`;
    expect(toPlainExcerpt(content, 100)).toBe('제목 굵게 링크');
  });

  it('toPlainExcerpt는 리치텍스트 태그 껍데기만 지우고 안쪽 텍스트는 남긴다', () => {
    const content =
      '<p class="text-align-center"><span class="text-color-red">빨간 가운데</span></p> 그냥 <u>밑줄</u>';
    expect(toPlainExcerpt(content, 100)).toBe('빨간 가운데 그냥 밑줄');
  });

  it('toPlainExcerpt는 이미지 마크다운을 파일명까지 통째로 지운다', () => {
    const content = '![커뮤니티_예산투명화.png](post-images/1/93ff5650-1e67.png)\n\n테스트';
    expect(toPlainExcerpt(content, 100)).toBe('테스트');
  });

  it('toPlainExcerpt는 maxLength를 넘으면 말줄임표를 붙인다', () => {
    expect(toPlainExcerpt('가나다라마바사', 3)).toBe('가나다…');
  });

  it('extractFirstImageUrl은 본문 첫 이미지의 src를 뽑는다', () => {
    const content = '텍스트\n\n![alt](https://x.com/a.png)\n\n![alt2](https://x.com/b.png)';
    expect(extractFirstImageUrl(content)).toBe('https://x.com/a.png');
  });

  it('extractFirstImageUrl은 이미지가 없으면 undefined를 반환한다', () => {
    expect(extractFirstImageUrl('그냥 텍스트뿐')).toBeUndefined();
  });
});

// ADR-0013 결정 1 — 본문 배치 임베드 토큰. PostContent의 "짝수=마크다운, 홀수=임베드" 규약이
// 여기서 나오므로 split 결과의 인덱스 규칙이 계약이다.
describe('placement token', () => {
  it('splitContentByPlacementTokens는 짝수 인덱스에 마크다운, 홀수 인덱스에 배치 id를 둔다', () => {
    const content = `앞 ${buildPlacementToken(12)} 뒤 ${buildPlacementToken(34)} 끝`;
    expect(splitContentByPlacementTokens(content)).toEqual(['앞 ', '12', ' 뒤 ', '34', ' 끝']);
  });

  it('splitContentByPlacementTokens는 토큰이 없으면 원문 한 조각만 돌려준다', () => {
    expect(splitContentByPlacementTokens('토큰 없음')).toEqual(['토큰 없음']);
  });

  it('extractPlacementIds는 중복을 지운 숫자 id를 돌려준다 — 조회를 한 번으로 묶기 위함', () => {
    const content = `${buildPlacementToken(7)} ... ${buildPlacementToken(7)} ... ${buildPlacementToken(9)}`;
    expect(extractPlacementIds(content)).toEqual([7, 9]);
  });

  it('extractPlacementIds는 여러 번 불러도 같은 결과다(전역 정규식 lastIndex 오염 없음)', () => {
    const content = buildPlacementToken(3);
    expect(extractPlacementIds(content)).toEqual([3]);
    expect(extractPlacementIds(content)).toEqual([3]);
  });

  it('toPlainExcerpt는 배치 토큰을 미리보기 문장에서 지운다', () => {
    expect(toPlainExcerpt(`내 책상 ${buildPlacementToken(12)} 소개`, 100)).toBe('내 책상 소개');
  });
});
