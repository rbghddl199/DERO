// 커뮤니티 작성 에디터의 Notion풍 툴바 — 블록 타입·굵게·기울임·밑줄·글자색·정렬·링크·이미지·삽입(+) 메뉴.
// 밑줄·글자색·정렬은 TEXT_COLOR_PRESETS/TEXT_ALIGN_CLASS_NAMES(richTextClasses.ts)의 고정 팔레트만 지원한다 —
// serializeEditorContent가 이 값만 안전한 class로 저장하고 PostContent의 sanitize 허용 목록도 이 값만 통과시킨다.
'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useRef, useState, type ReactNode } from 'react';
import { POST_IMAGE_ACCEPT_ATTRIBUTE } from '@/constants/post';
import { TEXT_COLOR_PRESETS } from './richTextClasses';

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.5" cy="6" r="1" fill="currentColor" />
    <path
      d="M2.5 11l3.5-3.5 2.5 2.5L11.5 7l2 2.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6.5 9.5l3-3M6 6.2 7.4 4.8a2 2 0 1 1 2.8 2.8L8.8 9M10 9.8 8.6 11.2a2 2 0 1 1-2.8-2.8L7.2 7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AlignIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ToolbarButton = ({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={`flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-[8px] px-1.5 text-[13px] ${
      active ? 'bg-highlight text-ink' : 'text-ink hover:bg-fog'
    }`}
  >
    {children}
  </button>
);

const ToolbarDropdown = ({
  label,
  panelClassName,
  children,
}: {
  label: ReactNode;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-ink hover:bg-fog flex h-7 cursor-pointer items-center gap-0.5 rounded-[8px] px-1.5 text-[13px]"
      >
        {label}
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          className={`bg-paper border-ash/40 absolute top-full left-0 z-10 mt-1 rounded-[10px] border p-1.5 shadow-md ${panelClassName ?? ''}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const BLOCK_TYPE_OPTIONS = [
  { key: 'paragraph', label: '본문' },
  { key: 'h1', label: '제목 1' },
  { key: 'h2', label: '제목 2' },
  { key: 'h3', label: '제목 3' },
] as const;

type Props = {
  editor: Editor | null;
  /** 고른 파일을 받아 본문에 넣을 src를 돌려준다 — 없으면 세션 한정 blob URL(새로고침하면 깨진다).
   *  글 작성/수정 화면은 항상 이걸 넘겨 실제 업로드 경로로 바꾼다(ADR-0013 파급). */
  onSelectImage?: (file: File) => string;
};

// immediatelyRender:false라 editor는 마운트 직후 한동안 null이다 — 그 사이에도 툴바 자체는 항상
// 보여야 하므로(클릭해서 포커스해야만 나타나는 건 버그) editor가 없을 때 쓸 기본값을 둔다.
const DEFAULT_TOOLBAR_STATE = {
  blockType: 'paragraph' as const,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isLink: false,
  color: null as string | null,
  align: 'left' as const,
};

const PostRichEditorToolbar = ({ editor, onSelectImage }: Props) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const state =
    useEditorState({
      editor,
      selector: ({ editor: e }) =>
        e
          ? {
              blockType: e.isActive('heading', { level: 1 })
                ? 'h1'
                : e.isActive('heading', { level: 2 })
                  ? 'h2'
                  : e.isActive('heading', { level: 3 })
                    ? 'h3'
                    : 'paragraph',
              isBold: e.isActive('bold'),
              isItalic: e.isActive('italic'),
              isUnderline: e.isActive('underline'),
              isLink: e.isActive('link'),
              color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
              align: e.isActive({ textAlign: 'center' })
                ? 'center'
                : e.isActive({ textAlign: 'right' })
                  ? 'right'
                  : 'left',
            }
          : null,
    }) ?? DEFAULT_TOOLBAR_STATE;

  const setBlockType = (key: (typeof BLOCK_TYPE_OPTIONS)[number]['key']) => {
    if (key === 'paragraph') editor?.chain().focus().setParagraph().run();
    else
      editor
        ?.chain()
        .focus()
        .toggleHeading({ level: Number(key[1]) as 1 | 2 | 3 })
        .run();
  };

  const handleImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    const src = onSelectImage ? onSelectImage(file) : URL.createObjectURL(file);
    editor.chain().focus().setImage({ src, alt: file.name }).run();
  };

  // 이 저장소엔 커스텀 팝오버 없이 window.prompt를 쓰는 선례가 없지만, 링크 하나만을 위해 별도 상태·
  // 포지셔닝을 갖춘 팝오버를 만들 정도의 기능은 아니라고 판단해 최소 구현으로 둔다.
  const insertLink = () => {
    if (!editor) return;
    const previousHref = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('링크 주소를 입력하세요 (http/https/mailto)', previousHref);
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  };

  return (
    <div className="border-ash/40 flex flex-wrap items-center gap-1 rounded-t-[10px] border border-b-0 px-2 py-1.5">
      <input
        ref={imageInputRef}
        type="file"
        // presign이 받는 MIME 넷만 — `image/*`로 두면 heic 같은 걸 고른 뒤 업로드에서 400이 난다
        accept={POST_IMAGE_ACCEPT_ATTRIBUTE}
        onChange={handleImageSelected}
        className="hidden"
      />
      <ToolbarButton label="이미지 삽입" onClick={() => imageInputRef.current?.click()}>
        <ImageIcon />
      </ToolbarButton>

      <span className="bg-ash/30 mx-0.5 h-4 w-px" />

      <ToolbarDropdown label={BLOCK_TYPE_OPTIONS.find((o) => o.key === state.blockType)?.label}>
        {(close) => (
          <div className="flex flex-col">
            {BLOCK_TYPE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setBlockType(option.key);
                  close();
                }}
                className={`cursor-pointer rounded-[6px] px-3 py-1.5 text-left text-[13px] whitespace-nowrap ${
                  state.blockType === option.key ? 'bg-highlight text-ink' : 'text-ink hover:bg-fog'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <span className="bg-ash/30 mx-0.5 h-4 w-px" />

      <ToolbarButton
        label="굵게"
        active={state.isBold}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="기울임"
        active={state.isItalic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="밑줄"
        active={state.isUnderline}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>

      <ToolbarDropdown
        label={
          <span
            className="border-ash/40 h-3.5 w-3.5 rounded-full border"
            style={{ backgroundColor: state.color ?? undefined }}
          />
        }
      >
        {(close) => (
          <div className="flex items-center gap-1.5 px-1 py-1">
            <button
              type="button"
              aria-label="기본 색상"
              onClick={() => {
                editor?.chain().focus().unsetColor().run();
                close();
              }}
              className="border-ash/40 bg-paper h-5 w-5 cursor-pointer rounded-full border"
            />
            {TEXT_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.className}
                type="button"
                aria-label={preset.label}
                onClick={() => {
                  editor?.chain().focus().setColor(preset.hex).run();
                  close();
                }}
                style={{ backgroundColor: preset.hex }}
                className="h-5 w-5 cursor-pointer rounded-full"
              />
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarDropdown label={<AlignIcon />}>
        {(close) => (
          <div className="flex flex-col">
            {(
              [
                ['left', '왼쪽 정렬'],
                ['center', '가운데 정렬'],
                ['right', '오른쪽 정렬'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  editor?.chain().focus().setTextAlign(value).run();
                  close();
                }}
                className={`cursor-pointer rounded-[6px] px-3 py-1.5 text-left text-[13px] whitespace-nowrap ${
                  state.align === value ? 'bg-highlight text-ink' : 'text-ink hover:bg-fog'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarButton label="링크" active={state.isLink} onClick={insertLink}>
        <LinkIcon />
      </ToolbarButton>

      <span className="bg-ash/30 mx-0.5 h-4 w-px" />

      <ToolbarDropdown label={<span className="text-[15px] leading-none">+</span>}>
        {(close) => (
          <div className="flex flex-col">
            {(
              [
                ['글머리 기호 목록', () => editor?.chain().focus().toggleBulletList().run()],
                ['번호 목록', () => editor?.chain().focus().toggleOrderedList().run()],
                ['인용', () => editor?.chain().focus().toggleBlockquote().run()],
                ['구분선', () => editor?.chain().focus().setHorizontalRule().run()],
              ] as const
            ).map(([label, run]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  run();
                  close();
                }}
                className="text-ink hover:bg-fog cursor-pointer rounded-[6px] px-3 py-1.5 text-left text-[13px] whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>
    </div>
  );
};

export default PostRichEditorToolbar;
