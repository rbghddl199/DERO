'use client';
// 글 작성 화면 — 제목 + 마크다운 본문(Tiptap) + 해시태그 + 내 공개 배치 삽입 + 사진 업로드.
//
// **저장 순서가 이 화면의 핵심이다.** 이미지 presign 경로가 `POST /posts/{id}/images/upload-urls`라
// 글이 먼저 있어야 한다. 그래서 ①`POST /posts`로 글을 만들고 ②사진을 2단계 presign으로 올려
// 등록하고 ③본문의 blob URL을 **imageKey**로 치환해 `PUT /posts/{id}`로 마무리한다.
// 툴바가 본문에 꽂는 blob URL은 그 치환 전까지만 쓰는 미리보기 주소다 — 저장된 본문에는 남지 않는다.
//
// **본문에 저장하는 것은 presigned URL이 아니라 key다.** presigned GET URL은 TTL이 있어(S3 15분)
// 본문에 박으면 15분 뒤 이미지가 전부 깨진다 — blob URL 문제를 같은 성질의 문제로 바꿔놓을 뿐이다.
// 만료 없는 key를 저장하고, 상세 화면이 `PostDetailResponse.images`로 URL을 해석한다(PostContent).
//
// 배치 삽입의 **저장 포맷**은 `[[placement:ID]]` 토큰 그대로다(ADR-0013 결정 1). 다만 에디터 안에서는
// 토큰 날문자열이 아니라 Tiptap atom 노드(placementEmbedNode.tsx)로 꽂아 상세 화면과 같은 배치 카드를
// 보여주고, serializeEditorContent가 저장 시 그 노드를 다시 토큰 문자열로 되돌린다.

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createCommunityPost, updateCommunityPost } from '@/api/community';
import { uploadPostImages } from '@/api/post';
import { POST_IMAGE_MAX_COUNT } from '@/constants/post';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { confirmDiscardDraft, useUnsavedDraftGuard } from '@/hooks/useUnsavedDraftGuard';
import { toPostSaveErrorMessage } from '@/utils/postError';
import PlacementInsertPanel from './PlacementInsertPanel';
import PostRichEditor, { type PostRichEditorHandle } from './PostRichEditor';

const MIN_TITLE_LENGTH = 2;
const MIN_CONTENT_LENGTH = 10;

type FieldErrors = {
  title?: string;
  content?: string;
};

const FieldError = ({ id, message }: { id: string; message: string }) => (
  <p id={id} role="alert" className="text-danger-700 text-[13px] leading-5">
    {message}
  </p>
);

const CommunityEditor = () => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const richEditorRef = useRef<PostRichEditorHandle>(null);
  // 본문에 꽂힌 blob URL → 실제 파일. 렌더에 쓰이지 않으므로 state가 아니라 ref다.
  const pendingImagesRef = useRef(new Map<string, File>());
  const hasDraft =
    title.trim() !== '' || content.trim() !== '' || tags.length > 0 || tagInput.trim() !== '';
  useUnsavedDraftGuard(hasDraft && !isSubmitting);

  const registerImage = (file: File): string => {
    const previewUrl = URL.createObjectURL(file);
    pendingImagesRef.current.set(previewUrl, file);
    return previewUrl;
  };

  const addTag = () => {
    const next = tagInput.trim().replace(/^#/, '');
    if (!next) return;
    setTags((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setTagInput('');
  };

  const handleTagInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
      return;
    }
    // 입력이 비어있을 때 Backspace를 누르면 마지막 태그를 지운다 — 흔한 태그 입력 UX
    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  // 파생 상태라 렌더 중에 계산한다(state로 들고 effect에서 동기화하면 한 박자 늦는다)
  const errors: FieldErrors = {};
  if (title.trim().length < MIN_TITLE_LENGTH) {
    errors.title = `제목을 ${MIN_TITLE_LENGTH}자 이상 입력해주세요.`;
  }
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    errors.content = `본문을 ${MIN_CONTENT_LENGTH}자 이상 입력해주세요.`;
  }
  const isValid = Object.keys(errors).length === 0;
  const visibleErrors: FieldErrors = hasAttemptedSubmit ? errors : {};

  const submit = async (): Promise<void> => {
    const trimmedTitle = title.trim();
    const draftContent = content.trim();
    // 본문에 실제로 남아 있는 사진만 올린다 — 넣었다 지운 파일까지 올리면 상한만 잡아먹는다.
    const usedImages = [...pendingImagesRef.current.entries()].filter(([previewUrl]) =>
      draftContent.includes(previewUrl),
    );

    if (usedImages.length > POST_IMAGE_MAX_COUNT) {
      setSubmitError(`사진은 한 글에 ${POST_IMAGE_MAX_COUNT}장까지만 넣을 수 있어요.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createCommunityPost({
        title: trimmedTitle,
        content: draftContent,
        hashtags: tags,
      });

      let finalContent = draftContent;
      if (usedImages.length > 0) {
        const uploaded = await uploadPostImages(
          created.id,
          usedImages.map(([, file]) => file),
          true,
        );
        uploaded.forEach((image, index) => {
          finalContent = finalContent.split(usedImages[index][0]).join(image.imageKey);
        });
        await updateCommunityPost(created.id, {
          title: trimmedTitle,
          content: finalContent,
          hashtags: tags,
        });
      }

      for (const [previewUrl] of pendingImagesRef.current) URL.revokeObjectURL(previewUrl);
      pendingImagesRef.current.clear();
      router.push(`/community/${created.id}`);
    } catch (error) {
      console.error('[CommunityEditor] 글 등록에 실패했습니다', error);
      setSubmitError(toPostSaveErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!isValid) {
      setHasAttemptedSubmit(true);
      if (errors.title) {
        titleRef.current?.focus();
      } else if (errors.content) {
        richEditorRef.current?.focus();
      }
      return;
    }
    if (!requireAuth()) return;
    void submit();
  };

  return (
    <form onSubmit={handleSubmit} className="font-swiss mx-auto max-w-[720px] tracking-[-0.03em]">
      <h1 className="text-ink mb-6 text-[32px] leading-[1.2] font-medium">커뮤니티 글 작성하기</h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">제목</span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예) 미니멀 원목 데스크 완성"
            aria-invalid={visibleErrors.title ? true : undefined}
            aria-describedby={visibleErrors.title ? 'editor-error-title' : undefined}
            className={`bg-paper text-ink placeholder:text-ash rounded-[10px] border px-3 py-2 text-[16px] outline-none ${
              visibleErrors.title ? 'border-danger-500' : 'border-ash/40'
            }`}
            autoFocus
          />
          {visibleErrors.title && (
            <FieldError id="editor-error-title" message={visibleErrors.title} />
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">본문</span>
          <PostRichEditor
            ref={richEditorRef}
            onChange={setContent}
            onSelectImage={registerImage}
            hasError={Boolean(visibleErrors.content)}
            describedById={visibleErrors.content ? 'editor-error-content' : undefined}
          />
          {visibleErrors.content && (
            <FieldError id="editor-error-content" message={visibleErrors.content} />
          )}
        </div>

        <PlacementInsertPanel
          onInsert={(placement) => richEditorRef.current?.insertPlacement(placement)}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[14px] font-medium">
            태그 <span className="text-ash font-normal">(최대 5개 선택)</span>
          </span>
          <div className="border-ash/40 flex flex-wrap items-center gap-2 rounded-[10px] border px-3 py-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="border-ash/40 bg-paper text-ink flex items-center gap-1 rounded-full border px-3 py-1 text-[13px]"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  aria-label={`${tag} 태그 삭제`}
                  className="text-ash hover:text-ink cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={handleTagInputKeyDown}
              onBlur={addTag}
              placeholder={tags.length === 0 ? '예) 원목데스크, 미니멀셋업' : ''}
              className="text-ink placeholder:text-ash min-w-[120px] flex-1 py-0.5 text-[14px] outline-none"
            />
          </div>
        </label>
      </div>

      {submitError && (
        <p role="alert" className="text-danger-700 mt-4 text-[14px] leading-6">
          {submitError}
        </p>
      )}

      <div className="mt-8 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            if (!hasDraft || confirmDiscardDraft()) router.push('/community');
          }}
          className="text-ink cursor-pointer text-[16px]"
        >
          취소
        </button>
        <button
          type="submit"
          aria-disabled={!isValid || isSubmitting || undefined}
          className="bg-highlight text-ink hover:bg-primary-300 cursor-pointer rounded-[10px] px-4 py-2 text-[16px] font-medium transition-colors"
        >
          {isSubmitting ? '등록 중...' : '등록하기'}
        </button>
      </div>
    </form>
  );
};

export default CommunityEditor;
