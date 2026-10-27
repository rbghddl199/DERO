// 약관 본문 마크다운 렌더 — 서버 컴포넌트다('use client' 없음).
//
// PostContent.tsx·AssetGuideModal.tsx와 통합하지 않는다. 게시글은 밑줄·글자색·정렬 때문에 rehype-raw로
// raw HTML을 부분 허용하는 sanitize 스키마를 따로 유지하는데, 약관은 관리자가 올린 우리 문서라 raw HTML을
// 허용할 이유가 없다 — rehype-sanitize 기본 스키마(raw HTML은 react-markdown이 애초에 escape)면 충분하다.
// react-markdown은 동기 default export(Markdown)만 서버 컴포넌트에서 쓸 수 있다(MarkdownHooks는 훅 사용).

import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2 className="text-ink mt-8 mb-3 text-[20px] font-semibold">{children}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="text-ink mt-7 mb-2 text-[18px] font-semibold">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-ink mt-6 mb-2 text-[16px] font-semibold">{children}</h4>
  ),
  p: ({ children }) => <p className="text-ink mb-3 text-[15px] leading-[1.8]">{children}</p>,
  ul: ({ children }) => (
    <ul className="text-ink mb-3 list-disc space-y-1 pl-5 text-[15px] leading-[1.8]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-ink mb-3 list-decimal space-y-1 pl-5 text-[15px] leading-[1.8]">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-ash/40 text-ash my-4 border-l-2 pl-4 text-[15px]">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="bg-fog rounded px-1 py-0.5 text-[13px]">{children}</code>
  ),
  hr: () => <hr className="border-ash/40 my-6" />,
  a: ({ children, href }) => (
    <a href={href} className="text-primary-700 underline underline-offset-2">
      {children}
    </a>
  ),
  // 표는 좁은 화면에서 페이지 자체를 좌우로 늘리지 않도록 자기 안에서 스크롤시킨다.
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="border-ash/40 w-full border-collapse border text-[14px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-ash/40 bg-fog text-ink border px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-ash/40 text-ink border px-3 py-2 align-top">{children}</td>
  ),
};

type Props = {
  /** 백엔드 스토리지에서 서버가 읽어 온 마크다운 원문 */
  content: string;
};

const TermsDocument = ({ content }: Props) => (
  <div className="font-swiss tracking-[-0.03em]">
    <Markdown
      components={MARKDOWN_COMPONENTS}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
    >
      {content}
    </Markdown>
  </div>
);

export default TermsDocument;
