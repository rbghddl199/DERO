// 멘션(D35·ADR-0038) — 저장된 텍스트가 화면에서 무엇이 되는가만 본다.
// 못 박는 것: ① 토큰이 프로필 링크가 된다 ② 해석 못 한 토큰은 "@알 수 없음" 무링크다
// ③ 토큰이 아닌 `@`(이메일 주소 등)는 건드리지 않는다 ④ 닉네임이 마크다운·HTML로 새지 않는다
// ⑤ `@` 자동완성 트리거 판정이 이메일에서 열리지 않는다.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import MentionText from '@/components/community/MentionText';
import PostContent from '@/components/community/PostContent';
import {
  buildMentionToken,
  resolveMentions,
  splitContentByMentionTokens,
  toPlainExcerpt,
} from '@/components/community/communityContent';
import { findMentionTrigger } from '@/utils/mentionQuery';

const MENTIONS = [{ userId: 12, nickname: '책상주인' }];

const renderBody = (content: string, mentions = MENTIONS) =>
  renderToStaticMarkup(createElement(PostContent, { content: resolveMentions(content, mentions) }));

const renderComment = (content: string, mentions = MENTIONS) =>
  renderToStaticMarkup(createElement(MentionText, { content, mentions }));

describe('멘션 토큰 치환', () => {
  it('본문 토큰은 현재 닉네임 텍스트 + 프로필 링크가 된다', () => {
    const html = renderBody(`이건 ${buildMentionToken(12)} 의 책상입니다`);

    expect(html).toContain('href="/users/12"');
    expect(html).toContain('@책상주인');
    expect(html).not.toContain('[[user:12]]');
  });

  it('해석표에 없는 토큰은 "@알 수 없음" 평문이다 — 죽은 링크를 밟지 않는다', () => {
    const html = renderBody(`이건 ${buildMentionToken(999)} 의 책상입니다`);

    expect(html).toContain('@알 수 없음');
    expect(html).not.toContain('href="/users/999"');
    expect(html).not.toContain('[[user:999]]');
  });

  it('토큰이 아닌 @문자열은 그대로 둔다 — 이메일 주소가 깨지지 않는다', () => {
    const content = '연락은 dero@example.com 으로 주세요';

    expect(resolveMentions(content, MENTIONS)).toBe(content);
  });

  it('닉네임의 마크다운·HTML 문자는 이스케이프한다 — 링크 라벨이 태그가 되지 않는다', () => {
    const html = renderBody(buildMentionToken(12), [{ userId: 12, nickname: '<b>*굵게*' }]);

    expect(html).toContain('href="/users/12"');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<em>');
  });

  it('댓글은 마크다운을 거치지 않고 조각내 그린다 — 사용자가 친 *는 기울임이 되지 않는다', () => {
    const html = renderComment(`${buildMentionToken(12)} 님 *이거* 맞죠?`);

    expect(html).toContain('href="/users/12"');
    expect(html).toContain('*이거*');
    expect(html).not.toContain('<em>');
  });

  it('댓글의 해석 못 한 토큰도 "@알 수 없음"이다', () => {
    const html = renderComment(buildMentionToken(999));

    expect(html).toContain('@알 수 없음');
    expect(html).not.toContain('href="/users/999"');
  });

  it('카드 발췌에는 토큰이 아니라 @닉네임이 남는다', () => {
    const excerpt = toPlainExcerpt(
      resolveMentions(`이건 ${buildMentionToken(12)} 의 책상`, MENTIONS),
      60,
    );

    expect(excerpt).toContain('@책상주인');
    expect(excerpt).not.toContain('user:12');
  });

  it('split은 짝수=평문, 홀수=사용자 id다', () => {
    expect(splitContentByMentionTokens(`앞 ${buildMentionToken(12)} 뒤`)).toEqual([
      '앞 ',
      '12',
      ' 뒤',
    ]);
  });
});

describe('@ 자동완성 트리거', () => {
  it('줄 시작·공백 뒤의 @만 연다', () => {
    expect(findMentionTrigger('@책')).toEqual({ query: '책', start: 0 });
    expect(findMentionTrigger('이건 @책상')).toEqual({ query: '책상', start: 3 });
  });

  it('이메일 주소는 열지 않는다 — 멘션이 아닌 @를 그대로 쓸 수 있어야 한다', () => {
    expect(findMentionTrigger('dero@example')).toBeNull();
  });

  it('@만 친 직후에도 열려 있다 — 다음 글자부터 후보를 찾는다', () => {
    expect(findMentionTrigger('이건 @')).toEqual({ query: '', start: 3 });
  });

  it('공백이 끼면 닫힌다 — 문장 뒤쪽까지 트리거가 늘어붙지 않는다', () => {
    expect(findMentionTrigger('@책상 주인의')).toBeNull();
  });

  // Tiptap은 줄바꿈·atom 노드(이미지·배치·멘션 칩)를 `￼` 한 글자로 세어 넘긴다 — 허용 접두에
  // 없으면 Shift+Enter 직후나 칩 바로 뒤에서만 자동완성이 조용히 안 열린다.
  it('줄바꿈·atom 노드 자리표시자 뒤의 @도 연다', () => {
    expect(findMentionTrigger('앞 문장￼@책')).toEqual({ query: '책', start: 5 });
  });
});

describe('멘션 해석표가 없는 응답', () => {
  // 배포 롤링 창(멘션 이전 백엔드)엔 필드 자체가 없다 — 화면이 통째로 죽는 것보다 "@알 수 없음"이 낫다.
  it('본문·댓글 둘 다 죽지 않고 "@알 수 없음"으로 떨어진다', () => {
    expect(resolveMentions(buildMentionToken(12), undefined)).toBe('@알 수 없음');
    expect(
      renderToStaticMarkup(createElement(MentionText, { content: buildMentionToken(12) })),
    ).toContain('@알 수 없음');
  });
});
