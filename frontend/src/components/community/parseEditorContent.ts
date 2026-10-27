// 저장 문자열 → Tiptap JSON 문서. `serializeEditorContent.ts`의 정확한 역방향이며, 수정 화면이
// 기존 본문을 위지윅에 실을 때 쓴다(그 파서가 없어서 수정은 원문 textarea였다).
//
// **범용 마크다운 파서가 아니다** — serializeEditorContent가 뱉는 문법 부분집합만 다룬다(제목 1~3,
// 글머리·번호 목록, 인용, 구분선, 이미지, 링크, 굵게·기울임, <u>, text-color-* span,
// text-align-* p, [[placement:ID]] 토큰, 하드브레이크). 그 밖의 마크다운(표·코드블록 등)은 에디터
// 스키마에도 없으므로 평문으로 남는다.
//
// 계약은 하나다: **왕복 무손실**(`serialize(parse(x)) === x`). 보증 범위는 위 문법 집합이고
// `tests/parseEditorContent.test.ts`가 지킨다. 새 문법을 직렬화에 추가하면 여기와 그 테스트도 같이
// 고칠 것 — 안 고치면 수정 화면을 거친 글에서 그 문법이 조용히 사라진다.
//
// 알려진 한계 둘(둘 다 화면에 보이는 결과는 안 바뀐다 — 마크다운 렌더가 같게 읽는다):
// ①**빈 문단은 사라진다** — 블록을 빈 줄로 끊어 읽으므로 문단 사이 여분의 빈 줄이 한 칸으로 준다.
// ②**블록 앞뒤 공백은 잘린다**. 되살리려면 문단 사이 개행 수를 세야 하는데, 배치 토큰 블록이
// 앞에 개행 하나를 더 붙이는 것과 구분이 안 돼 오히려 그 왕복이 깨진다.
import type { PlacementSummaryResponse } from '@/types/placement';
import { PLACEMENT_TOKEN_PATTERN, USER_MENTION_TOKEN_PATTERN } from './communityContent';
import { TEXT_COLOR_PRESETS } from './richTextClasses';

type JsonMark = { type: string; attrs?: Record<string, unknown> };
export type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: JsonMark[];
};

const CLASS_TO_COLOR: Record<string, string> = Object.fromEntries(
  TEXT_COLOR_PRESETS.map((preset) => [preset.className, preset.hex]),
);

/** serializeEditorContent의 escapeMarkdownChars와 같은 집합이어야 한다 */
const ESCAPABLE = '\\*_`[]<>';

const HEADING_PATTERN = /^(#{1,3}) (.*)$/;
const ALIGNED_PARAGRAPH_PATTERN = /^<p class="text-align-(center|right)">([\s\S]*)<\/p>$/;
const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)]*)\)$/;
const PLACEMENT_LINE_PATTERN = /^\[\[placement:(\d+)\]\]$/;
const BULLET_ITEM_PATTERN = /^- (.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\. (.*)$/;
const COLOR_SPAN_OPEN_PATTERN = /^<span class="([^"]*)">/;

/** 백슬래시로 이스케이프된 자리를 건너뛰며 needle의 첫 위치를 찾는다 */
function indexOfUnescaped(text: string, needle: string, from: number): number {
  for (let index = from; index <= text.length - needle.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text.startsWith(needle, index)) return index;
  }
  return -1;
}

/** 링크의 닫는 `]`는 바로 뒤가 `(`인 것뿐이다 — `[[placement:1]]` 토큰과 헷갈리지 않게 한다 */
function indexOfLinkClose(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === ']' && text[index + 1] === '(') return index;
  }
  return -1;
}

type Wrapped = { inner: string; end: number; marks: JsonMark[] };

/** 위치 i에서 시작하는 마크 래퍼 하나를 떼어낸다 — 직렬화의 중첩 순서를 바깥에서 안으로 되짚는다 */
function matchWrapper(text: string, index: number): Wrapped | null {
  if (text[index] === '[') {
    const close = indexOfLinkClose(text, index + 1);
    if (close !== -1) {
      const hrefEnd = text.indexOf(')', close + 2);
      if (hrefEnd !== -1) {
        return {
          inner: text.slice(index + 1, close),
          end: hrefEnd + 1,
          marks: [{ type: 'link', attrs: { href: text.slice(close + 2, hrefEnd) } }],
        };
      }
    }
  }

  const spanOpen = COLOR_SPAN_OPEN_PATTERN.exec(text.slice(index));
  if (spanOpen !== null) {
    const openLength = spanOpen[0].length;
    const close = indexOfUnescaped(text, '</span>', index + openLength);
    if (close !== -1) {
      const color = CLASS_TO_COLOR[spanOpen[1]];
      return {
        inner: text.slice(index + openLength, close),
        end: close + '</span>'.length,
        // 팔레트에 없는 클래스는 직렬화가 만들 수 없는 값이다 — 글자만 남기고 색은 버린다
        marks: color === undefined ? [] : [{ type: 'textStyle', attrs: { color } }],
      };
    }
  }

  if (text.startsWith('<u>', index)) {
    const close = indexOfUnescaped(text, '</u>', index + 3);
    if (close !== -1) {
      return {
        inner: text.slice(index + 3, close),
        end: close + '</u>'.length,
        marks: [{ type: 'underline' }],
      };
    }
  }

  // 직렬화는 굵게를 먼저 감싸고 기울임을 바깥에 씌운다 — 그래서 `***`의 바깥이 기울임이다
  for (const [delimiter, marks] of [
    ['***', [{ type: 'italic' }, { type: 'bold' }]],
    ['**', [{ type: 'bold' }]],
    ['*', [{ type: 'italic' }]],
  ] as const) {
    if (!text.startsWith(delimiter, index)) continue;
    const close = indexOfUnescaped(text, delimiter, index + delimiter.length);
    if (close !== -1) {
      return {
        inner: text.slice(index + delimiter.length, close),
        end: close + delimiter.length,
        marks: [...marks],
      };
    }
  }

  return null;
}

function parseInlineInto(
  text: string,
  marks: JsonMark[],
  out: JsonNode[],
  mentions: ReadonlyMap<number, string>,
): void {
  let buffer = '';
  const flush = () => {
    if (buffer === '') return;
    out.push(
      marks.length === 0 ? { type: 'text', text: buffer } : { type: 'text', text: buffer, marks },
    );
    buffer = '';
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];

    if (char === '\\' && ESCAPABLE.includes(text[index + 1] ?? '')) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (char === '\n') {
      flush();
      out.push({ type: 'hardBreak' });
      index += 1;
      continue;
    }

    // 멘션 토큰은 **인라인 노드**가 된다(D35·ADR-0038) — 배치 토큰처럼 평문으로 남기면
    // 이스케이프에 걸려 수정 화면을 한 번 거치는 순간 `\[\[user:12\]\]`가 되어 죽는다.
    // 닉네임은 에디터 세션용 스냅샷이고 직렬화는 id만 읽는다.
    const mentionToken = new RegExp(USER_MENTION_TOKEN_PATTERN.source, 'y');
    mentionToken.lastIndex = index;
    const mentionMatch = mentionToken.exec(text);
    if (mentionMatch !== null) {
      flush();
      const userId = Number(mentionMatch[1]);
      out.push({
        type: 'mention',
        attrs: { userId, nickname: mentions.get(userId) ?? null },
      });
      index += mentionMatch[0].length;
      continue;
    }

    // 문장 속 배치 토큰은 저장 포맷의 일부라 이스케이프도 파싱도 하지 않고 원형으로 남긴다
    const token = new RegExp(PLACEMENT_TOKEN_PATTERN.source, 'y');
    token.lastIndex = index;
    const tokenMatch = token.exec(text);
    if (tokenMatch !== null) {
      buffer += tokenMatch[0];
      index += tokenMatch[0].length;
      continue;
    }

    const wrapper = matchWrapper(text, index);
    if (wrapper !== null) {
      flush();
      parseInlineInto(wrapper.inner, [...marks, ...wrapper.marks], out, mentions);
      index = wrapper.end;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
}

function parseInline(text: string, mentions: ReadonlyMap<number, string>): JsonNode[] {
  const nodes: JsonNode[] = [];
  parseInlineInto(text, [], nodes, mentions);
  return nodes;
}

function paragraphOf(
  text: string,
  mentions: ReadonlyMap<number, string>,
  attrs?: Record<string, unknown>,
): JsonNode {
  const content = parseInline(text, mentions);
  return content.length === 0
    ? { type: 'paragraph', ...(attrs ? { attrs } : {}) }
    : { type: 'paragraph', ...(attrs ? { attrs } : {}), content };
}

/** 마커로 시작하지 않는 줄은 **앞 항목의 이어진 줄**이다 — 항목 안에 하드브레이크가 있으면
 *  직렬화가 그렇게 내보내고(`- a\nb`), 마크다운 렌더러도 같은 항목으로 읽는다. 줄마다 항목을
 *  끊으면 그 목록이 수정 화면에서 통째로 평문이 된다. */
function listOf(
  lines: string[],
  ordered: boolean,
  mentions: ReadonlyMap<number, string>,
): JsonNode {
  const pattern = ordered ? ORDERED_ITEM_PATTERN : BULLET_ITEM_PATTERN;
  const items: string[] = [];
  for (const line of lines) {
    const marker = pattern.exec(line);
    if (marker !== null || items.length === 0) items.push(marker?.[1] ?? line);
    else items[items.length - 1] += `\n${line}`;
  }
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraphOf(item, mentions)] })),
  };
}

function imageOf(match: RegExpExecArray, imageUrls: ReadonlyMap<string, string>): JsonNode {
  const [, alt, src] = match;
  return { type: 'image', attrs: { src: imageUrls.get(src) ?? src, alt } };
}

type ParseOptions = {
  /** 본문에 박힌 imageKey를 화면에 띄울 URL로 바꾸는 해석표 */
  imageUrls?: ReadonlyMap<string, string>;
  /** 배치 토큰 자리에 카드를 그리기 위한 조회 결과 — 없으면 "삭제된 배치입니다"로 보인다 */
  placements?: ReadonlyMap<number, PlacementSummaryResponse>;
  /** 멘션 토큰 자리에 그릴 닉네임(D35·ADR-0038) — 없으면 칩이 "@알 수 없음"으로 보인다 */
  mentions?: ReadonlyMap<number, string>;
};

type ResolvedOptions = {
  imageUrls: ReadonlyMap<string, string>;
  placements: ReadonlyMap<number, PlacementSummaryResponse>;
  mentions: ReadonlyMap<number, string>;
};

/** 한 블록(빈 줄로 끊긴 덩어리)을 노드 0개 이상으로 바꾼다 */
function parseBlock(block: string, options: ResolvedOptions): JsonNode[] {
  const { imageUrls } = options;
  const trimmed = block.trim();
  if (trimmed === '') return [];

  if (trimmed === '---') return [{ type: 'horizontalRule' }];

  const placement = PLACEMENT_LINE_PATTERN.exec(trimmed);
  if (placement !== null) {
    const placementId = Number(placement[1]);
    return [
      {
        type: 'placementEmbed',
        // 스냅샷은 에디터 세션용이다 — 직렬화는 id만 읽으므로 TTL 있는 thumbnailUrl이 본문에
        // 새어나가지 않는다(placementEmbedNode.tsx의 같은 규칙).
        attrs: { placementId, placement: options.placements.get(placementId) ?? null },
      },
    ];
  }

  const heading = HEADING_PATTERN.exec(trimmed);
  if (heading !== null) {
    return [
      {
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2], options.mentions),
      },
    ];
  }

  const aligned = ALIGNED_PARAGRAPH_PATTERN.exec(trimmed);
  if (aligned !== null) {
    return [paragraphOf(aligned[2], options.mentions, { textAlign: aligned[1] })];
  }

  const lines = trimmed.split('\n');

  // 목록인지는 **첫 줄의 마커**가 정한다(뒷줄은 이어진 줄일 수 있다 — listOf 참고)
  if (BULLET_ITEM_PATTERN.test(lines[0])) return [listOf(lines, false, options.mentions)];
  if (ORDERED_ITEM_PATTERN.test(lines[0])) return [listOf(lines, true, options.mentions)];

  if (lines.every((line) => line === '>' || line.startsWith('> '))) {
    const inner = lines.map((line) => line.slice(line === '>' ? 1 : 2)).join('\n');
    return [{ type: 'blockquote', content: parseBlocks(inner, options) }];
  }

  // 이미지는 그 자체로 블록 노드다 — 문단과 같은 덩어리에 섞여 있어도 따로 떼어낸다
  // (직렬화는 늘 자기 블록으로 내보내지만, 손으로 고친 본문·V14 이관본은 섞여 올 수 있다).
  const nodes: JsonNode[] = [];
  let pending: string[] = [];
  const flushPending = () => {
    if (pending.length > 0) nodes.push(paragraphOf(pending.join('\n'), options.mentions));
    pending = [];
  };
  for (const line of lines) {
    const image = IMAGE_LINE_PATTERN.exec(line);
    if (image === null) {
      pending.push(line);
      continue;
    }
    flushPending();
    nodes.push(imageOf(image, imageUrls));
  }
  flushPending();
  return nodes;
}

function parseBlocks(content: string, options: ResolvedOptions): JsonNode[] {
  return content.split(/\n{2,}/).flatMap((block) => parseBlock(block, options));
}

/**
 * 저장 문자열을 Tiptap 문서로 되돌린다.
 *
 * 본문 정본은 언제나 imageKey와 `[[placement:ID]]` 토큰이다(URL 조립 규칙이 바뀌어도 본문은
 * 그대로) — `options`는 **에디터에 보여줄 때만** 쓰는 해석표이고, 저장 문자열로 돌아갈 때
 * 다시 key·토큰이 된다.
 */
export function parseEditorContent(content: string, options: ParseOptions = {}): JsonNode {
  const nodes = parseBlocks(content, {
    imageUrls: options.imageUrls ?? new Map(),
    placements: options.placements ?? new Map(),
    mentions: options.mentions ?? new Map(),
  });
  return { type: 'doc', content: nodes.length === 0 ? [{ type: 'paragraph' }] : nodes };
}
