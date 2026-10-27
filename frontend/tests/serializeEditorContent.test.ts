// serializeEditorContent(Tiptap JSON → 저장 문자열) 포맷 계약 검증 — communityContent.ts와 어긋나면
// PostRichEditor로 쓴 글이 상세 페이지에서 깨진다.
import { describe, expect, it } from 'vitest';
import { serializeEditorContent } from '@/components/community/serializeEditorContent';

const text = (value: string, marks: unknown[] = []) => ({ type: 'text', text: value, marks });
const paragraph = (content: unknown[], attrs?: Record<string, unknown>) => ({
  type: 'paragraph',
  attrs,
  content,
});
const doc = (content: unknown[]) => ({ type: 'doc', content });

describe('serializeEditorContent', () => {
  it('평범한 문단은 그대로 텍스트로 나온다', () => {
    expect(serializeEditorContent(doc([paragraph([text('hello')])]))).toBe('hello');
  });

  it('굵게/기울임/굵게+기울임을 마크다운으로 표현한다', () => {
    expect(serializeEditorContent(doc([paragraph([text('a', [{ type: 'bold' }])])]))).toBe('**a**');
    expect(serializeEditorContent(doc([paragraph([text('a', [{ type: 'italic' }])])]))).toBe('*a*');
    expect(
      serializeEditorContent(doc([paragraph([text('a', [{ type: 'bold' }, { type: 'italic' }])])])),
    ).toBe('***a***');
  });

  it('밑줄은 <u>로 감싼다', () => {
    expect(serializeEditorContent(doc([paragraph([text('a', [{ type: 'underline' }])])]))).toBe(
      '<u>a</u>',
    );
  });

  it('팔레트에 있는 글자색은 class span으로, 없는 색은 버린다', () => {
    const withPreset = doc([
      paragraph([text('a', [{ type: 'textStyle', attrs: { color: '#ef4444' } }])]),
    ]);
    expect(serializeEditorContent(withPreset)).toBe('<span class="text-color-red">a</span>');

    const withUnknown = doc([
      paragraph([text('a', [{ type: 'textStyle', attrs: { color: '#123456' } }])]),
    ]);
    expect(serializeEditorContent(withUnknown)).toBe('a');
  });

  it('가운데/오른쪽 정렬은 <p class>로, 왼쪽/기본은 그대로 둔다', () => {
    expect(serializeEditorContent(doc([paragraph([text('a')], { textAlign: 'center' })]))).toBe(
      '<p class="text-align-center">a</p>',
    );
    expect(serializeEditorContent(doc([paragraph([text('a')], { textAlign: 'right' })]))).toBe(
      '<p class="text-align-right">a</p>',
    );
    expect(serializeEditorContent(doc([paragraph([text('a')], { textAlign: 'left' })]))).toBe('a');
    expect(serializeEditorContent(doc([paragraph([text('a')])]))).toBe('a');
  });

  it('안전한 링크는 마크다운 링크로, javascript: 링크는 버린다', () => {
    const safe = doc([
      paragraph([text('a', [{ type: 'link', attrs: { href: 'https://example.com' } }])]),
    ]);
    expect(serializeEditorContent(safe)).toBe('[a](https://example.com)');

    const unsafe = doc([
      paragraph([text('a', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])]),
    ]);
    expect(serializeEditorContent(unsafe)).toBe('a');
  });

  it('제목 레벨은 #을 반복한다', () => {
    expect(
      serializeEditorContent(
        doc([{ type: 'heading', attrs: { level: 2 }, content: [text('제목')] }]),
      ),
    ).toBe('## 제목');
  });

  it('글머리 기호/번호 목록을 직렬화한다', () => {
    const bullet = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph([text('첫째')])] },
          { type: 'listItem', content: [paragraph([text('둘째')])] },
        ],
      },
    ]);
    expect(serializeEditorContent(bullet)).toBe('- 첫째\n- 둘째');

    const ordered = doc([
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [paragraph([text('첫째')])] },
          { type: 'listItem', content: [paragraph([text('둘째')])] },
        ],
      },
    ]);
    expect(serializeEditorContent(ordered)).toBe('1. 첫째\n2. 둘째');
  });

  it('인용은 모든 줄 앞에 >를 붙인다', () => {
    const quote = doc([{ type: 'blockquote', content: [paragraph([text('인용문')])] }]);
    expect(serializeEditorContent(quote)).toBe('> 인용문');
  });

  it('구분선과 이미지를 직렬화한다', () => {
    expect(serializeEditorContent(doc([{ type: 'horizontalRule' }]))).toBe('---');
    expect(
      serializeEditorContent(doc([{ type: 'image', attrs: { src: 'blob:x', alt: '사진' } }])),
    ).toBe('![사진](blob:x)');
  });

  it('평문에 등장한 마크다운 특수문자·꺾쇠는 이스케이프된다', () => {
    expect(serializeEditorContent(doc([paragraph([text('2 * 2 = 4')])]))).toBe('2 \\* 2 = 4');
    expect(serializeEditorContent(doc([paragraph([text('<script>')])]))).toBe('\\<script\\>');
  });

  // ADR-0013 결정 1 — 저장 포맷은 평문 토큰이다. 에디터가 카드로 보여주는 placementEmbed 노드도
  // 저장 시엔 반드시 이 토큰으로 되돌아와야 상세 화면(PostContent)이 같은 자리에 카드를 그린다.
  it('placementEmbed 노드는 [[placement:ID]] 토큰으로 되돌아간다', () => {
    expect(
      serializeEditorContent(doc([{ type: 'placementEmbed', attrs: { placementId: 402 } }])),
    ).toBe('[[placement:402]]');
  });

  it('문단 사이의 placementEmbed 노드는 앞뒤 문단과 분리돼 한 번만 나온다', () => {
    const mixed = doc([
      paragraph([text('앞 문단')]),
      { type: 'placementEmbed', attrs: { placementId: 402 } },
      paragraph([text('뒤 문단')]),
    ]);
    expect(serializeEditorContent(mixed)).toBe('앞 문단\n\n\n[[placement:402]]\n\n뒤 문단');
  });

  it('placementId가 비어 있는 placementEmbed 노드는 토큰을 만들지 않는다', () => {
    expect(serializeEditorContent(doc([{ type: 'placementEmbed', attrs: {} }]))).toBe('');
    expect(
      serializeEditorContent(doc([{ type: 'placementEmbed', attrs: { placementId: null } }])),
    ).toBe('');
  });

  // 노드를 안 쓰고 사용자가 손으로 친 토큰도 여전히 살아남아야 한다 — 대괄호까지 이스케이프하면
  // PostContent가 토큰을 못 알아보고 글자 그대로 보인다.
  it('[[placement:ID]] 토큰은 이스케이프하지 않고 원형으로 내보낸다', () => {
    expect(serializeEditorContent(doc([paragraph([text('앞 [[placement:12]] 뒤')])]))).toBe(
      '앞 [[placement:12]] 뒤',
    );
  });

  it('토큰이 아닌 대괄호는 그대로 이스케이프한다', () => {
    expect(serializeEditorContent(doc([paragraph([text('[[placement:abc]]')])]))).toBe(
      '\\[\\[placement:abc\\]\\]',
    );
  });

  // D35·ADR-0038 결정 1 — 멘션도 저장 포맷은 토큰이다. 배치와 달리 **인라인**이라 문장 중간에서
  // 앞뒤 글자와 이어져 나와야 한다.
  it('mention 노드는 문장 중간에서 [[user:ID]] 토큰으로 되돌아간다', () => {
    const inline = doc([
      paragraph([
        text('이건 '),
        { type: 'mention', attrs: { userId: 12, nickname: '책상주인' } },
        text(' 의 책상'),
      ]),
    ]);

    expect(serializeEditorContent(inline)).toBe('이건 [[user:12]] 의 책상');
  });

  it('멘션 노드의 닉네임 스냅샷은 저장 문자열에 새지 않는다 — 읽는 쪽이 현재 닉네임으로 그린다', () => {
    const serialized = serializeEditorContent(
      doc([paragraph([{ type: 'mention', attrs: { userId: 12, nickname: '책상주인' } }])]),
    );

    expect(serialized).toBe('[[user:12]]');
    expect(serialized).not.toContain('책상주인');
  });

  it('userId가 없는 멘션 노드는 토큰을 만들지 않는다', () => {
    expect(serializeEditorContent(doc([paragraph([{ type: 'mention', attrs: {} }])]))).toBe('');
  });
});
