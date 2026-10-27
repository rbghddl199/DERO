// Tiptap 에디터의 JSON 문서를 게시물 저장용 문자열로 직렬화한다.
// 굵게·기울임·링크·목록·인용은 순정 마크다운으로, 밑줄·글자색·정렬은 마크다운으로 표현이 안 되므로
// 고정 팔레트 클래스(<u>, <span class="text-color-*">, <p class="text-align-*">)로 내보낸다 —
// PostContent.tsx가 rehype-sanitize 허용 목록으로 이 클래스만 통과시켜 렌더한다.
// 마크 조합(예: 굵게+색상)은 bold → italic → underline → color → link 순으로 고정 중첩한다(모든 조합의
// 마크다운 표현이 하나뿐은 아니지만, 저장 후 다시 화면에 그대로 보이는 것만 보장하면 충분하다).
import {
  buildMentionToken,
  buildPlacementToken,
  splitContentByPlacementTokens,
} from './communityContent';
import { TEXT_COLOR_PRESETS } from './richTextClasses';

type JsonMark = { type: string; attrs?: Record<string, unknown> };
type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: JsonMark[];
};

const COLOR_TO_CLASS: Record<string, string> = Object.fromEntries(
  TEXT_COLOR_PRESETS.map((preset) => [preset.hex, preset.className]),
);

const ALIGN_TO_CLASS: Record<string, string> = {
  center: 'text-align-center',
  right: 'text-align-right',
};

// 인라인 강조 문법과 겹치는 문자, 그리고 `<`/`>`를 이스케이프한다. `<`/`>`는 PostContent.tsx가
// 밑줄·색상·정렬 표현을 위해 rehype-raw로 raw HTML을 파싱하게 되면서 반드시 필요해졌다 — 이스케이프가
// 없으면 사용자가 그냥 입력한 "<script>" 같은 평문도 실제 HTML 태그로 해석될 조합이 생긴다(둘 다
// CommonMark 백슬래시 이스케이프 대상 문장부호라 `\<`/`\>`는 항상 리터럴 문자로 되돌아온다).
// 문단 맨 앞 `#`/`>`/`-` 같은 블록 기호까지 이스케이프하면 기존 toPlainText(communityContent.ts)와
// 처리 강도가 달라지므로 일부러 손대지 않는다(알려진 한계).
const escapeMarkdownChars = (text: string): string => text.replace(/([\\*_`[\]<>])/g, '\\$1');

// `[[placement:ID]]`는 사용자가 친 평문이 아니라 저장 포맷의 일부다(ADR-0013 결정 1) — 대괄호까지
// 이스케이프하면 PostContent가 토큰을 못 알아보고 글자 그대로 보인다. 토큰 조각만 원형으로 남긴다.
const escapeInlineMarkdown = (text: string): string =>
  splitContentByPlacementTokens(text)
    .map((segment, index) =>
      index % 2 === 1 ? buildPlacementToken(Number(segment)) : escapeMarkdownChars(segment),
    )
    .join('');

const isSafeLinkHref = (href: string): boolean => /^(https?:|mailto:)/i.test(href.trim());

function serializeTextWithMarks(text: string, marks: JsonMark[] = []): string {
  let result = escapeInlineMarkdown(text);

  if (marks.some((mark) => mark.type === 'bold')) result = `**${result}**`;
  if (marks.some((mark) => mark.type === 'italic')) result = `*${result}*`;
  if (marks.some((mark) => mark.type === 'underline')) result = `<u>${result}</u>`;

  const colorMark = marks.find(
    (mark) => mark.type === 'textStyle' && typeof mark.attrs?.color === 'string',
  );
  const colorClass = colorMark && COLOR_TO_CLASS[colorMark.attrs!.color as string];
  if (colorClass) result = `<span class="${colorClass}">${result}</span>`;

  const linkMark = marks.find(
    (mark) => mark.type === 'link' && typeof mark.attrs?.href === 'string',
  );
  const href = linkMark?.attrs!.href as string | undefined;
  // Tiptap Link 확장 자체도 입력 시점에 javascript: 등을 막지만, 저장되는 문자열에도 한 번 더 검증한다
  if (href && isSafeLinkHref(href)) result = `[${result}](${href})`;

  return result;
}

function serializeInline(nodes: JsonNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return serializeTextWithMarks(node.text ?? '', node.marks);
      if (node.type === 'hardBreak') return '\n';
      // 에디터 안에서만 `@닉네임` 칩으로 보이는 멘션 노드(mentionNode.tsx) — 저장은 토큰으로
      // 되돌린다. **닉네임 스냅샷은 문자열에 넣지 않는다**(placementEmbed와 같은 규칙): 읽는 쪽이
      // 서버가 준 현재 닉네임으로 다시 그려야 닉변에 안전하다.
      if (node.type === 'mention') {
        const userId = Number(node.attrs?.userId);
        return Number.isInteger(userId) && userId > 0 ? buildMentionToken(userId) : '';
      }
      return '';
    })
    .join('');
}

function wrapParagraphAlign(text: string, align: unknown): string {
  const alignClass = typeof align === 'string' ? ALIGN_TO_CLASS[align] : undefined;
  if (!alignClass || text.trim() === '') return text;
  return `<p class="${alignClass}">${text}</p>`;
}

function serializeListItems(items: JsonNode[], ordered: boolean): string {
  return items
    .map((item, index) => {
      const text = (item.content ?? []).map(serializeBlock).join('').trim();
      const marker = ordered ? `${index + 1}.` : '-';
      return `${marker} ${text}`;
    })
    .join('\n');
}

function serializeBlock(node: JsonNode): string {
  switch (node.type) {
    case 'paragraph': {
      const text = serializeInline(node.content);
      if (text.trim() === '') return '\n';
      return `${wrapParagraphAlign(text, node.attrs?.textAlign)}\n\n`;
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3);
      return `${'#'.repeat(level)} ${serializeInline(node.content)}\n\n`;
    }
    case 'bulletList':
      return `${serializeListItems(node.content ?? [], false)}\n\n`;
    case 'orderedList':
      return `${serializeListItems(node.content ?? [], true)}\n\n`;
    case 'blockquote': {
      const inner = (node.content ?? [])
        .map(serializeBlock)
        .join('')
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return `${inner}\n\n`;
    }
    case 'horizontalRule':
      return '---\n\n';
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      if (!src) return '';
      return `![${alt}](${src})\n\n`;
    }
    // 에디터 안에서만 카드로 보이는 배치 임베드 노드(placementEmbedNode.tsx) — 저장은 토큰으로 되돌린다
    case 'placementEmbed': {
      const placementId = Number(node.attrs?.placementId);
      return Number.isInteger(placementId) && placementId > 0
        ? `\n${buildPlacementToken(placementId)}\n\n`
        : '';
    }
    default:
      return '';
  }
}

export function serializeEditorContent(doc: JsonNode): string {
  return (doc.content ?? []).map(serializeBlock).join('').trim();
}
