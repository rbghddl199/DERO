// 커뮤니티·데스크피드 작성 화면의 본문 입력 위젯 — Tiptap 기반 Notion풍 위지윅 에디터.
// 사진은 툴바·업로드 존뿐 아니라 **드래그 앤 드롭(드롭 위치)과 ⌘V 붙여넣기(커서 위치)**로도
// 들어온다(D34·ADR-0037 결정 2) — 셋 다 호출부의 `onSelectImage`를 태워 blob↔File 짝을 한 곳에 모은다.
// content 문자열([[placement:ID]] 토큰이 섞인 마크다운)과의 변환만 담당하고, 그 문자열을 쓰는 나머지
// 로직(검증·제출·미리보기)은 CommunityEditor.tsx가 그대로 소유한다 — onChange로만 동기화한다.
// 수정 화면은 `initialContent`로 기존 본문을 실어 넣는다(parseEditorContent가 역방향) — 작성 화면은
// 안 넘기면 빈 문서로 시작한다.
'use client';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useMentionAutocomplete } from '@/hooks/useMentionAutocomplete';
import type { PlacementSummaryResponse } from '@/types/placement';
import type { UserSearchResultResponse } from '@/types/user';
import { findMentionTrigger } from '@/utils/mentionQuery';
import MentionNode from './mentionNode';
import MentionSuggestionList from './MentionSuggestionList';
import { toImageAlt } from './communityContent';
import { parseEditorContent } from './parseEditorContent';
import PlacementEmbedNode from './placementEmbedNode';
import PostRichEditorToolbar from './PostRichEditorToolbar';
import { serializeEditorContent } from './serializeEditorContent';

export type PostRichEditorHandle = {
  focus: () => void;
  /** 본문 전체를 저장 문자열로 갈아끼운다 — 수정 화면이 본문 밖에서 사진을 지웠을 때 쓴다 */
  setContent: (content: string) => void;
  /** 배치 카드를 커서 자리에 atom 노드로 꽂는다 — 저장 시 `[[placement:ID]]` 토큰으로 직렬화된다 */
  insertPlacement: (placement: PlacementSummaryResponse) => void;
  /** 사진 여러 장을 본문 끝에 이어 꽂는다 — 툴바의 단건 삽입과 달리 폼 상단 업로드 존이 쓴다
   *  (데스크피드 작성 화면). src는 저장 전까지 blob 미리보기 주소고 호출부가 key로 치환한다. */
  insertImages: (images: readonly { src: string; alt: string }[]) => void;
};

/** 지금 선택이 이미지 노드면 그 사진의 src, 아니면 null. 이미지는 클릭 한 번에 NodeSelection이 된다. */
function selectedImageSrcOf(editor: Editor): string | null {
  const { node } = editor.state.selection as { node?: { type: { name: string }; attrs: unknown } };
  if (node === undefined || node.type.name !== 'image') return null;
  const { src } = node.attrs as { src?: unknown };
  return typeof src === 'string' ? src : null;
}

/** 에디터 스키마 — `serializeEditorContent`·`parseEditorContent`가 다루는 노드/마크 집합과 1:1이다.
 *  (테스트가 이 목록으로 스키마를 세워 파서 출력이 실제로 실리는지 검증한다.) */
export const POST_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { protocols: ['http', 'https', 'mailto'], openOnClick: false },
    strike: false,
    code: false,
    codeBlock: false,
  }),
  TextStyle,
  Color,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right'],
  }),
  ImageExtension,
  Placeholder.configure({
    placeholder: '데스크테리어 이야기를 자유롭게 적어보세요.',
  }),
  PlacementEmbedNode,
  // 멘션 노드는 `enableMention`과 무관하게 항상 스키마에 있다 — 켜고 끄는 것은 `@` 트리거뿐이다.
  // 스키마가 호출부마다 갈리면 같은 저장 문자열이 화면마다 다르게 파싱된다.
  MentionNode,
];

/** 붙여넣기·드롭에 실린 이미지 파일만 고른다 — 텍스트나 다른 파일은 기본 동작에 맡긴다. */
function imageFilesOf(transfer: DataTransfer | null): File[] {
  if (transfer === null) return [];
  return Array.from(transfer.files).filter((file) => file.type.startsWith('image/'));
}

/** 파일들을 미리보기 주소로 바꿔 그 위치에 이미지 노드로 꽂는다(뒤에 문단 하나를 남긴다). */
function insertImagesAt(
  view: EditorView,
  pos: number,
  files: readonly File[],
  register: (file: File) => string,
): void {
  const nodes = files.flatMap((file) => {
    // alt에 `[`·`]`·`(`·`)`가 남으면 저장된 이미지 마크다운이 다시 파싱되지 않는다 — 수정 화면을
    // 한 번 거치는 순간 그 사진이 본문에서 사라지고 S3 객체만 남는다(toImageAlt 주석 참고).
    const image = view.state.schema.nodes.image.create({
      src: register(file),
      alt: toImageAlt(file.name),
    });
    return [image, view.state.schema.nodes.paragraph.create()];
  });
  view.dispatch(view.state.tr.insert(pos, nodes));
}

type Props = {
  ref?: React.Ref<PostRichEditorHandle>;
  onChange: (content: string) => void;
  hasError?: boolean;
  describedById?: string;
  /** 툴바에서 고른 파일을 받아 본문에 넣을 src를 돌려준다 — 호출부가 업로드 대상으로 등록한다 */
  onSelectImage?: (file: File) => string;
  /** 이미 저장된 본문(수정 화면). **마운트 시점 한 번만 읽는다** — 이후 갱신은 `setContent`로 한다 */
  initialContent?: string;
  /** 본문에 박힌 imageKey를 화면에 띄울 URL로 바꾸는 해석표(수정 화면) */
  imageUrls?: ReadonlyMap<string, string>;
  /** 본문의 `[[placement:ID]]` 자리에 그릴 배치 — 없으면 카드가 "삭제된 배치입니다"로 뜬다 */
  placements?: ReadonlyMap<number, PlacementSummaryResponse>;
  /** 본문의 `[[user:ID]]` 자리에 그릴 닉네임 — 없으면 칩이 "@알 수 없음"으로 뜬다 */
  mentions?: ReadonlyMap<number, string>;
  /**
   * `@` 멘션 자동완성을 켠다 — **데스크피드 전용이다**(D35·ADR-0038 Out of Scope: 커뮤니티
   * 게시글 멘션은 부결). 커뮤니티에서 켜면 본문에 토큰이 저장되는데 커뮤니티 렌더는 해석표를
   * 받지 않아 `[[user:12]]`가 날것으로 보인다.
   */
  enableMention?: boolean;
  /**
   * 방금 고른 후보를 알린다 — 호출부가 `mentions` 해석표에 <b>먼저</b> 넣어야 한다. 안 넣으면
   * 그다음 `setContent`(본문 재파싱) 한 번에 그 멘션이 "@알 수 없음"으로 바뀐다(배치 삽입에서
   * 실제로 났던 버그와 같은 자리).
   */
  onMentionInsert?: (candidate: UserSearchResultResponse) => void;
  /**
   * 본문에서 고른 사진의 src가 바뀔 때마다 알린다(ADR-0040 결정 5) — 데스크피드 폼이 그 사진의
   * 제품 태그 패널을 여닫는다. 사진이 아닌 곳을 고르면 `null`이다.
   *
   * **src는 에디터가 보여주는 값이다** — 수정 화면에선 imageUrl(또는 아직 안 올라간 blob 주소)이고
   * 작성 화면에선 blob 미리보기 주소다. 호출부가 자기 표로 사진을 되찾는다.
   */
  onSelectedImageChange?: (src: string | null) => void;
};

/** 자동완성이 열린 위치 — 팝업은 `position: fixed`라 뷰포트 좌표를 그대로 쓴다. */
type MentionState = {
  query: string;
  /** 토큰으로 바꿀 구간의 시작(= `@`의 문서 위치). */
  from: number;
  left: number;
  top: number;
};

const PostRichEditor = ({
  ref,
  onChange,
  hasError,
  describedById,
  onSelectImage,
  initialContent,
  imageUrls,
  placements,
  mentions,
  enableMention = false,
  onMentionInsert,
  onSelectedImageChange,
}: Props) => {
  const [mention, setMention] = useState<MentionState | null>(null);
  const { candidates, activeIndex, moveActive, isUnavailable } = useMentionAutocomplete(
    mention === null ? null : mention.query,
  );
  const isSuggestionOpen = mention !== null && (candidates.length > 0 || isUnavailable);

  // 저장 문자열의 이미지 src는 만료 없는 key인데 화면에는 URL로 띄워야 한다 — 실을 때 key→URL,
  // 저장할 때 URL→key로 되돌린다. useEditor 콜백은 첫 렌더의 props를 붙잡으므로 ref로 최신을 본다
  // (수정 중 새로 올린 사진이 map에 늦게 들어와도 key로 되돌아가야 한다).
  const imageUrlsRef = useRef(imageUrls);
  const placementsRef = useRef(placements);
  const mentionsRef = useRef(mentions);
  const onSelectedImageChangeRef = useRef(onSelectedImageChange);
  useEffect(() => {
    imageUrlsRef.current = imageUrls;
    placementsRef.current = placements;
    mentionsRef.current = mentions;
    onSelectedImageChangeRef.current = onSelectedImageChange;
  }, [imageUrls, placements, mentions, onSelectedImageChange]);

  const toStoredContent = (serialized: string): string => {
    let result = serialized;
    imageUrlsRef.current?.forEach((url, key) => {
      result = result.split(url).join(key);
    });
    return result;
  };

  // 수정 화면은 마운트 시점에 이미 본문을 들고 있다(폼이 로딩 중엔 에디터를 그리지 않는다).
  // **한 번만 판다** — 생성자만 읽는 값이라, 그냥 두면 타자 한 번마다 본문 전체를 다시 파싱한다.
  const [initialDoc] = useState(() =>
    initialContent === undefined
      ? undefined
      : parseEditorContent(initialContent, { imageUrls, placements, mentions }),
  );

  const editor = useEditor({
    content: initialDoc,
    // Next.js App Router SSR에서 서버 렌더와 클라이언트 렌더가 어긋나는 걸 막는다(Tiptap v3 공식 권장)
    immediatelyRender: false,
    extensions: POST_EDITOR_EXTENSIONS,
    editorProps: {
      attributes: {
        class:
          'post-rich-editor-content text-ink text-[15px] leading-[1.7] focus:outline-none min-h-[380px]',
        ...(describedById ? { 'aria-describedby': describedById } : {}),
      },
      // ⌘V로 스크린샷 붙여넣기 — 커서 자리에 꽂는다. onSelectImage가 없는 호출부(읽기 전용
      // 조합)에서는 브라우저 기본 동작에 맡긴다.
      handlePaste: (view, event) => {
        const files = imageFilesOf(event.clipboardData);
        if (onSelectImage === undefined || files.length === 0) return false;
        event.preventDefault();
        insertImagesAt(view, view.state.selection.from, files, onSelectImage);
        return true;
      },
      // 드래그 앤 드롭 — **드롭한 위치**에 꽂는다(본문 끝이 아니다). moved=true는 본문 안에서
      // 노드를 옮기는 것이라 가로채지 않는다.
      handleDrop: (view, event, _slice, moved) => {
        const files = imageFilesOf(event.dataTransfer);
        if (onSelectImage === undefined || moved || files.length === 0) return false;
        event.preventDefault();
        const dropped = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImagesAt(view, dropped?.pos ?? view.state.selection.from, files, onSelectImage);
        return true;
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(toStoredContent(serializeEditorContent(updatedEditor.getJSON())));
      syncMention(updatedEditor);
      // 사진을 지우면 선택은 그대로인 채 문서만 바뀐다 — 여기서도 알려야 패널이 닫힌다.
      onSelectedImageChangeRef.current?.(selectedImageSrcOf(updatedEditor));
    },
    // 커서만 옮겨도 닫혀야 한다 — 안 그러면 `@책` 뒤에서 문장 앞으로 갔는데 목록이 떠 있다.
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      syncMention(updatedEditor);
      onSelectedImageChangeRef.current?.(selectedImageSrcOf(updatedEditor));
    },
    // 포커스가 제목·태그 입력으로 옮겨 가도 닫는다 — 안 그러면 fixed 팝업이 마지막 커서 자리에
    // 그대로 떠 폼을 가린다. 후보 버튼은 mousedown에서 기본 동작을 막아 blur를 안 일으킨다.
    onBlur: () => setMention(null),
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  /**
   * 커서 앞 글자를 보고 자동완성을 열고 닫는다. 판정 규칙(`findMentionTrigger`)은 댓글 textarea와
   * **같은 함수**다 — 입력기마다 다르면 이메일 주소가 한쪽에서만 자동완성을 띄운다.
   *
   * 선택 영역이 있으면 닫는다(고르는 중이 아니라 지우려는 중이다). 좌표는 팝업 위치용이고,
   * 에디터가 스크롤되므로 `position: fixed` + 뷰포트 좌표를 쓴다.
   */
  const syncMention = (current: Editor): void => {
    if (!enableMention) return;
    const { $from, empty } = current.state.selection;
    if (!empty) {
      setMention(null);
      return;
    }
    // atom 노드(이미지·배치·멘션)와 줄바꿈은 한 글자짜리 자리표시자로 세어 위치 계산이 어긋나지
    // 않게 한다 — `findMentionTrigger`가 이 문자를 허용 접두로 안다.
    const before = $from.parent.textBetween(0, $from.parentOffset, '￼', '￼');
    const trigger = findMentionTrigger(before);
    if (trigger === null) {
      setMention(null);
      return;
    }
    const coords = current.view.coordsAtPos($from.pos);
    setMention({
      query: trigger.query,
      from: $from.pos - trigger.query.length - 1,
      left: coords.left,
      top: coords.bottom,
    });
  };

  /** `@질의`를 통째로 멘션 노드로 바꾼다 — 저장 문자열엔 id만 남는다. */
  const insertMention = (candidate: UserSearchResultResponse): void => {
    if (editor === null || mention === null) return;
    // **해석표를 먼저 채운다.** 이 뒤에 본문을 재파싱하는 일(사진 삭제 → setContent)이 생기면
    // 표에 없는 id는 "@알 수 없음"이 된다 — 배치 삽입에서 실제로 났던 버그와 같은 순서 문제다.
    onMentionInsert?.(candidate);
    editor
      .chain()
      .focus()
      .insertContentAt({ from: mention.from, to: editor.state.selection.$from.pos }, [
        { type: 'mention', attrs: { userId: candidate.userId, nickname: candidate.nickname } },
        { type: 'text', text: ' ' },
      ])
      .run();
    setMention(null);
  };

  /**
   * 방향키·Enter를 자동완성이 먼저 먹는다. **캡처 단계**라 ProseMirror의 키 핸들러보다 먼저 돌고,
   * `stopPropagation`으로 그쪽까지 안 내려간다 — 안 그러면 Enter가 문단을 쪼갠다.
   */
  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // 한글 조합 중의 Enter는 조합 확정이라 가로채면 글자가 사라진다.
    if (!isSuggestionOpen || event.nativeEvent.isComposing) return;
    const intercept = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'ArrowDown') {
      intercept();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      intercept();
      moveActive(-1);
      return;
    }
    if (event.key === 'Escape') {
      intercept();
      setMention(null);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const picked = candidates[activeIndex];
      if (picked === undefined) return;
      intercept();
      insertMention(picked);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editor?.chain().focus('end').run();
      },
      setContent: (content: string) => {
        if (editor === null) return;
        editor.commands.setContent(
          parseEditorContent(content, {
            imageUrls: imageUrlsRef.current,
            placements: placementsRef.current,
            mentions: mentionsRef.current,
          }),
        );
        // 전체 교체가 옮겨 놓은 선택은 사용자가 고른 것이 아니다 — 옛 선택 위치가 새 문서의
        // 이미지 atom에 떨어지면 그 사진의 NodeSelection이 되고(사진이 맨 위인 글은 맨 위 사진),
        // 위의 onUpdate가 그걸 방출해 태그 패널이 엉뚱한 사진을 물고 열린다 — 거기 붙인 제품
        // 태그는 그 사진으로 저장된다. 텍스트 선택으로 되돌리고 "고른 사진 없음"을 알린다.
        const { tr, doc } = editor.state;
        editor.view.dispatch(
          tr.setSelection(TextSelection.between(doc.resolve(0), doc.resolve(0))),
        );
        onSelectedImageChangeRef.current?.(null);
      },
      insertPlacement: (placement: PlacementSummaryResponse) => {
        editor
          ?.chain()
          .focus()
          .insertContent([
            { type: 'placementEmbed', attrs: { placementId: placement.id, placement } },
            // atom 노드가 문서 끝일 때 이어서 쓸 자리를 남긴다
            { type: 'paragraph' },
          ])
          .run();
      },
      insertImages: (images: readonly { src: string; alt: string }[]) => {
        if (images.length === 0) return;
        editor
          ?.chain()
          .focus('end')
          .insertContent([
            ...images.map((image) => ({ type: 'image', attrs: image })),
            { type: 'paragraph' },
          ])
          .run();
      },
    }),
    [editor],
  );

  return (
    <div onKeyDownCapture={handleKeyDownCapture}>
      {/* 에디터가 아직 마운트 전(immediatelyRender:false)이어도 툴바 자리는 유지해 레이아웃이 튀지 않게 한다 */}
      <PostRichEditorToolbar editor={editor as Editor | null} onSelectImage={onSelectImage} />
      <EditorContent
        editor={editor}
        className={`bg-paper rounded-b-[10px] border px-3 py-2 ${hasError ? 'border-danger-500' : 'border-ash/40'}`}
      />
      {/* 커서 바로 아래에 띄운다 — 본문이 길어 스크롤되므로 뷰포트 좌표(fixed)를 쓴다. */}
      {isSuggestionOpen && mention !== null && (
        <div className="fixed z-30 w-[240px]" style={{ left: mention.left, top: mention.top + 4 }}>
          <MentionSuggestionList
            candidates={candidates}
            activeIndex={activeIndex}
            onSelect={insertMention}
            isUnavailable={isUnavailable}
          />
        </div>
      )}
    </div>
  );
};

export default PostRichEditor;
