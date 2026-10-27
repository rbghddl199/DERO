'use client';
// 에셋·발광 등록 가이드 문서를 관리자 제품 상세에서 바로 읽게 하는 모달.
// 문서를 번들에 넣지 않고 열릴 때 public/에서 fetch하는 이유: Docker 빌드 컨텍스트가 ./frontend라
// ../docs/를 빌드타임에 읽을 수 없고(scripts/sync-admin-guide.mjs 참고), 지연 로딩이라 메인 번들도
// 안 커진다. 입력은 우리가 쓴 신뢰된 정적 문서라 PostContent처럼 좁은 허용목록을 쓰지 않고 기본
// sanitize 스키마로 충분하다. 표가 문서의 핵심이라 remark-gfm은 필수다(없으면 표가 문단으로 뭉개진다).

import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import BodyPortal from '@/components/common/BodyPortal';
import ErrorState from '@/components/common/ErrorState';
import LoadingState from '@/components/common/LoadingState';

const GUIDE_URL = '/docs/admin-asset-registration.md';
const TITLE_ID = 'admin-asset-guide-title';

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="text-ink mt-6 mb-2 text-[19px] font-semibold">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-ink mt-6 mb-2 text-[17px] font-semibold">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-ink mt-5 mb-1.5 text-[15px] font-semibold">{children}</h5>
  ),
  p: ({ children }) => <p className="text-ink mb-3 text-[14px] leading-[1.7]">{children}</p>,
  ul: ({ children }) => (
    <ul className="text-ink mb-3 list-disc space-y-1 pl-5 text-[14px] leading-[1.6]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-ink mb-3 list-decimal space-y-1 pl-5 text-[14px] leading-[1.6]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="marker:text-ash">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-ash/40 text-ash my-3 border-l-2 pl-4 text-[14px] leading-[1.7]">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="bg-highlight text-ink rounded px-1 py-0.5 text-[13px]">{children}</code>
  ),
  hr: () => <hr className="border-ash/20 my-6" />,
  // 표는 모달 자체가 가로로 밀리지 않도록 자기 컨테이너 안에서만 가로 스크롤한다.
  table: ({ children }) => (
    <div className="border-ash/20 mb-4 overflow-x-auto rounded-[10px] border">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-ash/20 bg-highlight text-ink border-b px-3 py-2 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-ash/20 text-ink border-b px-3 py-2 align-top leading-[1.6]">
      {children}
    </td>
  ),
};

type Props = {
  onClose: () => void;
};

const AssetGuideModal = ({ onClose }: Props) => {
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoadError(null);

      try {
        const response = await fetch(GUIDE_URL);
        if (!response.ok) throw new Error(`문서 응답이 ${response.status}입니다.`);
        const text = await response.text();
        if (isActive) setContent(text);
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : '알 수 없는 오류입니다.');
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [reloadToken]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 열려 있는 동안 뒤 페이지가 같이 스크롤되지 않게 잠근다.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // 열 때는 닫기 버튼으로, 닫을 때는 원래 트리거 버튼으로 포커스를 되돌린다.
  useEffect(() => {
    const previousFocused = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocused instanceof HTMLElement) previousFocused.focus();
    };
  }, []);

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-10"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={TITLE_ID}
          className="bg-paper font-swiss flex max-h-full w-full max-w-[880px] flex-col rounded-2xl tracking-[-0.03em] shadow-[0_18px_48px_rgba(24,24,27,0.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-ash/20 flex items-center justify-between gap-4 border-b px-7 py-5">
            <h2 id={TITLE_ID} className="text-ink text-xl font-bold">
              에셋·발광 등록 가이드
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="border-ash/30 text-ink cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
            >
              닫기
            </button>
          </div>

          <div className="overflow-y-auto px-7 py-6">
            {loadError !== null ? (
              <ErrorState
                title="가이드 문서를 불러오지 못했습니다"
                description={loadError}
                onRetry={() => setReloadToken((token) => token + 1)}
              />
            ) : content === null ? (
              <LoadingState label="가이드 문서를 불러오는 중" />
            ) : (
              <Markdown
                components={MARKDOWN_COMPONENTS}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
              >
                {content}
              </Markdown>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

export default AssetGuideModal;
