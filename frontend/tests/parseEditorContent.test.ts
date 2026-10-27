// parseEditorContent(저장 문자열 → Tiptap JSON) — serializeEditorContent의 역방향이다.
// **핵심 계약은 왕복 무손실**이다: 저장된 본문을 위지윅에 실었다가 그대로 저장하면 원문이 나와야
// 한다. 어긋나면 오타 하나 고친 사용자의 글에서 정렬·색·배치 카드가 조용히 사라진다.
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { parseEditorContent } from '@/components/community/parseEditorContent';
import { POST_EDITOR_EXTENSIONS } from '@/components/community/PostRichEditor';
import { serializeEditorContent } from '@/components/community/serializeEditorContent';

/** serializeEditorContent가 만들어 내는 문법 전집합 — 하나라도 빠지면 그 문법이 왕복에서 죽는다. */
const FULL_SYNTAX = [
  '# 제목 1',
  '',
  '### 제목 3',
  '',
  '평범한 문단과 **굵게**, *기울임*, ***둘 다***.',
  '',
  '<u>밑줄</u>과 <span class="text-color-red">빨강</span>과 [링크](https://example.com).',
  '',
  '<p class="text-align-center">가운데 정렬</p>',
  '',
  '<p class="text-align-right">오른쪽 정렬</p>',
  '',
  '- 첫째',
  '- 둘째',
  '',
  '1. 하나',
  '2. 둘',
  '',
  '> 인용문',
  '',
  '---',
  '',
  '![사진 설명](desk-feed-images/407/05ff545a.webp)',
  '',
  '',
  '[[placement:402]]',
  '',
  '앞 [[placement:12]] 뒤',
  '',
  // 멘션은 **인라인** 토큰이다(D35·ADR-0038) — 문장 중간에서도 왕복해야 한다.
  '이건 [[user:12]] 의 책상입니다',
  '',
  '2 \\* 2 = 4 그리고 \\<script\\>',
  '',
  '여러 줄이 있는\n문단은 하드브레이크다',
].join('\n');

describe('parseEditorContent', () => {
  it('저장 문자열 → Tiptap JSON → 저장 문자열 왕복이 무손실이다', () => {
    expect(serializeEditorContent(parseEditorContent(FULL_SYNTAX))).toBe(FULL_SYNTAX);
  });

  // 왕복만 맞고 스키마에 안 맞으면 setContent가 런타임에 터진다 — 실제 에디터 스키마로 검사한다.
  it('파싱 결과가 에디터 스키마에 실린다', () => {
    const schema = getSchema([...POST_EDITOR_EXTENSIONS]);
    expect(() => schema.nodeFromJSON(parseEditorContent(FULL_SYNTAX)).check()).not.toThrow();
    // 검사 자체가 헛돌지 않는지 — 목록 항목에 텍스트를 바로 넣은 잘못된 문서는 걸려야 한다.
    expect(() =>
      schema
        .nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'bulletList',
              content: [{ type: 'listItem', content: [{ type: 'text', text: 'x' }] }],
            },
          ],
        })
        .check(),
    ).toThrow();
  });

  it('빈 본문은 빈 문단 하나짜리 문서가 된다', () => {
    expect(parseEditorContent('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('이미지 src는 저장된 key 그대로 두고, 해석표가 있으면 표시용 URL로 바꾼다', () => {
    const content = '![사진](desk-feed-images/1/a.webp)';
    const [image] = parseEditorContent(content).content;
    expect(image).toEqual({
      type: 'image',
      attrs: { src: 'desk-feed-images/1/a.webp', alt: '사진' },
    });

    const resolved = parseEditorContent(content, {
      imageUrls: new Map([['desk-feed-images/1/a.webp', 'https://cdn/a.webp']]),
    });
    expect(resolved.content[0]).toEqual({
      type: 'image',
      attrs: { src: 'https://cdn/a.webp', alt: '사진' },
    });
  });

  it('단독 줄의 [[placement:ID]]는 카드 노드가 되고, 문장 속 토큰은 평문으로 남는다', () => {
    expect(parseEditorContent('[[placement:402]]').content[0]).toEqual({
      type: 'placementEmbed',
      attrs: { placementId: 402, placement: null },
    });

    expect(parseEditorContent('앞 [[placement:12]] 뒤').content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '앞 [[placement:12]] 뒤' }],
    });
  });

  it('마크 중첩은 직렬화와 같은 순서(굵게 안쪽 → 링크 바깥쪽)로 복원된다', () => {
    const [paragraph] = parseEditorContent('[**굵은 링크**](https://example.com)').content;
    expect(paragraph).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '굵은 링크',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'bold' }],
        },
      ],
    });
  });

  it('이스케이프된 특수문자는 원래 글자로 되돌아온다', () => {
    expect(parseEditorContent('2 \\* 2 \\<b\\>').content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '2 * 2 <b>' }],
    });
  });

  // 마커 없는 줄로 항목을 끊으면 그 목록이 수정 화면에서 통째로 평문이 된다(마커가 글자로 보인다).
  it('목록 항목 안의 이어진 줄은 항목을 쪼개지 않는다', () => {
    const [list] = parseEditorContent('- 첫째\n이어진 줄\n- 둘째').content;
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(2);
    expect(serializeEditorContent(parseEditorContent('- 첫째\n이어진 줄\n- 둘째'))).toBe(
      '- 첫째\n이어진 줄\n- 둘째',
    );
  });

  // 알려진 한계를 못으로 박아 둔다 — 렌더 결과는 같지만 왕복은 여기서 한 칸 준다.
  it('빈 문단은 왕복에서 사라진다(문서화된 한계)', () => {
    expect(serializeEditorContent(parseEditorContent('a\n\n\nb'))).toBe('a\n\nb');
  });

  it('팔레트에 없는 색 span은 마크 없이 글자만 남긴다', () => {
    expect(parseEditorContent('<span class="text-color-none">글자</span>').content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '글자' }],
    });
  });
});
