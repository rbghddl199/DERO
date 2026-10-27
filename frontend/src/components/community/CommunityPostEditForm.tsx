'use client';
// 글 수정 화면 — 본문은 작성 화면과 **같은 위지윅**(`PostRichEditor`)이다. `parseEditorContent`가
// 저장 문자열을 다시 Tiptap 문서로 되돌려 주므로 사진·배치 카드가 에디터 안에 그대로 보인다.
//
// 여기선 글이 이미 있으므로 사진은 고르는 즉시 업로드한다(작성 화면의 "글 먼저 → 업로드 → 치환"
// 2단계가 필요 없다). 본문에 넣는 것은 presigned URL이 아니라 **만료 없는 key**이고 — URL은 TTL이
// 있어 15분 뒤 깨진다 — 에디터에는 `imageUrls` 해석표로 URL을 보여준다.
//
// 배치 토큰은 **본문에 있던 자리 그대로** 카드로 뜬다. 예전처럼 토큰을 본문에서 떼어냈다가 저장할 때
// 앞에 몰아 붙이지 않는다(그러면 사용자가 배치를 문단 사이에 둔 의도가 저장할 때마다 무너진다).

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { updateCommunityPost } from '@/api/community';
import { listPlacements } from '@/api/placement';
import { getPost, uploadPostImages } from '@/api/post';
import { POST_IMAGE_MAX_COUNT } from '@/constants/post';
import { confirmDiscardDraft, useUnsavedDraftGuard } from '@/hooks/useUnsavedDraftGuard';
import { useAuthStore } from '@/store/authStore';
import type { PlacementSummaryResponse } from '@/types/placement';
import type { PostDetailResponse } from '@/types/post';
import { toPostSaveErrorMessage } from '@/utils/postError';
import { extractPlacementIds, removeImageMarkdown } from './communityContent';
import PlacementInsertPanel from './PlacementInsertPanel';
import PostRichEditor, { type PostRichEditorHandle } from './PostRichEditor';

const MIN_TITLE_LENGTH = 2;
const MIN_CONTENT_LENGTH = 10;
const MAX_TAG_COUNT = 5;

type Props = {
  postId: number;
};

type LoadState = 'loading' | 'ready' | 'error';

const CommunityPostEditForm = ({ postId }: Props) => {
  const router = useRouter();
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );

  const [detail, setDetail] = useState<PostDetailResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageCount, setImageCount] = useState(0);
  const [hasPrimaryImage, setHasPrimaryImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [placements, setPlacements] = useState<ReadonlyMap<number, PlacementSummaryResponse>>(
    () => new Map(),
  );
  const [images, setImages] = useState<PostDetailResponse['images']>([]);
  const richEditorRef = useRef<PostRichEditorHandle>(null);

  const hasChanges =
    detail !== null &&
    loadState === 'ready' &&
    (title !== detail.title ||
      content !== detail.content ||
      JSON.stringify(tags) !== JSON.stringify(detail.hashtags) ||
      tagInput.trim() !== '' ||
      imageCount !== detail.images.length);
  useUnsavedDraftGuard(hasChanges && !isSaving);

  // 에디터에 실을 해석표 — 본문 정본은 imageKey라 표시할 때만 URL로 바꾼다.
  const imageUrls = useMemo(
    () => new Map(images.map((image) => [image.imageKey, image.imageUrl])),
    [images],
  );

  // 본문이 참조하는 배치를 요청 한 번으로 받고 **그 다음에** 폼을 그린다 — 스냅샷 없이 먼저 그리면
  // 멀쩡한 배치가 잠깐 "삭제된 배치입니다"로 보인다(에디터는 마운트 시점 본문만 읽는다).
  useEffect(() => {
    let cancelled = false;
    getPost(postId)
      .then(async (loaded) => {
        const ids = extractPlacementIds(loaded.content);
        const page = ids.length === 0 ? null : await listPlacements({ ids }).catch(() => null);
        if (cancelled) return;
        setDetail(loaded);
        setTitle(loaded.title);
        setContent(loaded.content);
        setTags(loaded.hashtags);
        setImages(loaded.images);
        setImageCount(loaded.images.length);
        setHasPrimaryImage(loaded.images.some((image) => image.isPrimary));
        if (page !== null) {
          setPlacements(new Map(page.content.map((placement) => [placement.id, placement])));
        }
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // 업로드가 끝난 뒤 콜백이 읽어야 하는 최신 본문 — 그 사이 사용자는 계속 타이핑한다.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  /** 업로드 중인 장수 — 한 렌더에서 여러 장이 들어오므로 상태로는 못 센다. */
  const inFlightImagesRef = useRef(0);
  /** 이번 세션에서 대표를 이미 한 장 신청했는지 — 배치 삽입 때 전부 대표로 올리지 않게 한다. */
  const primaryClaimedRef = useRef(false);
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  /**
   * 본문 문자열과 에디터 문서를 함께 갈아끼운다. 에디터를 **효과에서** 건드리는 것이 핵심이다 —
   * `images`가 반영된 렌더 뒤여야 `PostRichEditor`의 (key → URL) 해석표가 최신이고, 그래야 방금
   * 올린 사진이 깨진 채로 뜨지 않는다(자식 효과가 부모 효과보다 먼저 돈다).
   */
  const pendingBodyRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingBodyRef.current === null) return;
    richEditorRef.current?.setContent(pendingBodyRef.current);
    pendingBodyRef.current = null;
  }, [content]);

  const swapBody = (next: (body: string) => string) => {
    const nextBody = next(contentRef.current);
    // 바뀐 게 없으면 아무것도 예약하지 않는다 — setContent가 리렌더를 걸러 효과가 안 돌면, 예약이
    // 남아 있다가 **한참 뒤 타자 한 번에** 그 시점 본문으로 되돌려 버린다.
    if (nextBody === contentRef.current) return;
    // 렌더를 기다리지 않고 즉시 최신화한다 — 사진 두 장이 같은 틱에 업로드를 마치면, 여기서
    // 갱신하지 않는 한 뒤엣놈이 앞엣놈의 치환을 덮어써 blob 주소가 그대로 저장된다.
    contentRef.current = nextBody;
    pendingBodyRef.current = nextBody;
    setContent(nextBody);
  };

  /**
   * 툴바·드롭·붙여넣기로 들어온 사진 — 미리보기 주소를 먼저 그 자리에 꽂고, 업로드가 끝나면 그
   * 자리의 주소만 만료 없는 imageKey로 바꾼다. 실패하면 죽은 blob이 본문에 남지 않게 도로 뗀다.
   */
  const registerImage = (file: File): string => {
    const previewUrl = URL.createObjectURL(file);
    // 회수는 화면을 떠날 때 한다 — 업로드 직후에 풀면 에디터가 그 자리를 실제 주소로 바꾸기 전에
    // 끊겨 사진이 잠깐 깨져 보인다.
    previewUrlsRef.current.push(previewUrl);
    // 여러 장을 한 번에 붙여넣으면 이 함수가 같은 렌더에서 연달아 불린다 — 예약 장수를 즉시 세지
    // 않으면 전부 상한 검사를 통과한다.
    inFlightImagesRef.current += 1;
    void uploadPicked(file, previewUrl);
    return previewUrl;
  };

  const uploadPicked = async (file: File, previewUrl: string): Promise<void> => {
    const dropPreview = () => swapBody((body) => removeImageMarkdown(body, previewUrl));

    if (imageCount + inFlightImagesRef.current > POST_IMAGE_MAX_COUNT) {
      setErrorMessage(`사진은 한 글에 ${POST_IMAGE_MAX_COUNT}장까지만 넣을 수 있어요.`);
      inFlightImagesRef.current -= 1;
      // 노드가 아직 안 꽂혔다 — 이 함수는 삽입과 같은 틱에 시작한다. 다음 마이크로태스크로 미룬다.
      void Promise.resolve().then(dropPreview);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const isPrimary = !hasPrimaryImage && !primaryClaimedRef.current;
      const [uploaded] = await uploadPostImages(postId, [file], isPrimary);
      primaryClaimedRef.current = true;
      setImages((prev) => [...prev, uploaded]);
      setImageCount((prev) => prev + 1);
      setHasPrimaryImage(true);
      swapBody((body) => body.split(previewUrl).join(uploaded.imageKey));
    } catch (error) {
      console.error('[CommunityPostEditForm] 사진 업로드에 실패했습니다', error);
      setErrorMessage(toPostSaveErrorMessage(error));
      dropPreview();
    } finally {
      inFlightImagesRef.current -= 1;
      setIsUploading(false);
    }
  };

  const addTag = () => {
    const next = tagInput.trim().replace(/^#/, '');
    if (!next) return;
    setTags((prev) =>
      prev.includes(next) || prev.length >= MAX_TAG_COUNT ? prev : [...prev, next],
    );
    setTagInput('');
  };

  const handleTagInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
      return;
    }
    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (isSaving) return;
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length < MIN_TITLE_LENGTH || trimmedContent.length < MIN_CONTENT_LENGTH) {
      setErrorMessage(
        `제목은 ${MIN_TITLE_LENGTH}자 이상, 본문은 ${MIN_CONTENT_LENGTH}자 이상 입력해주세요.`,
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateCommunityPost(postId, {
        title: trimmedTitle,
        content: trimmedContent,
        hashtags: tags,
      });
      router.push(`/community/${postId}`);
    } catch (error) {
      console.error('[CommunityPostEditForm] 글 수정에 실패했습니다', error);
      setErrorMessage(toPostSaveErrorMessage(error));
      setIsSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <p className="text-ash py-16 text-center text-[15px]">글을 불러오는 중...</p>;
  }

  if (loadState === 'error' || detail === null) {
    return (
      <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
        <p className="text-ink text-[18px] font-medium">이 글을 찾을 수 없어요</p>
        <Link
          href="/community"
          className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
        >
          커뮤니티로 돌아가기
        </Link>
      </div>
    );
  }

  // 서버도 403으로 막지만(POST_NOT_OWNED), 남의 글 편집 폼을 그려 놓고 저장 때 튕기는 건 나쁜 UX다.
  const isMyPost =
    myUserId !== null && detail.authorId != null && String(detail.authorId) === myUserId;
  if (!isMyPost) {
    return (
      <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
        <p className="text-ink text-[18px] font-medium">내 글만 수정할 수 있어요</p>
        <Link
          href={`/community/${postId}`}
          className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
        >
          글로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="font-swiss mx-auto max-w-[720px] tracking-[-0.03em]"
    >
      <h1 className="text-ink mb-6 text-[32px] leading-[1.2] font-medium">글 수정하기</h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">제목</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border-ash/40 bg-paper text-ink placeholder:text-ash rounded-[10px] border px-3 py-2 text-[16px] outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">본문</span>
          {/* 사진은 툴바 버튼·드래그 앤 드롭·⌘V 셋 다 이 에디터를 지난다(작성 화면과 같은 경로) */}
          <PostRichEditor
            ref={richEditorRef}
            initialContent={detail.content}
            imageUrls={imageUrls}
            placements={placements}
            onChange={setContent}
            onSelectImage={registerImage}
          />
          <p className="text-ash block w-full self-end text-right text-[13px]">
            {isUploading ? '사진 올리는 중...' : `사진 ${imageCount}/${POST_IMAGE_MAX_COUNT}장`}
          </p>
        </div>

        <PlacementInsertPanel
          onInsert={(placement) => {
            // 스냅샷을 해석표에도 넣는다 — 안 넣으면 사진을 한 장 올려 본문이 다시 파싱되는 순간
            // 방금 꽂은 카드가 "삭제된 배치입니다"로 바뀐다(저장된 토큰은 멀쩡한데도).
            setPlacements((prev) =>
              prev.has(placement.id) ? prev : new Map(prev).set(placement.id, placement),
            );
            richEditorRef.current?.insertPlacement(placement);
          }}
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

      {errorMessage && (
        <p role="alert" className="text-danger-700 mt-4 text-[14px] leading-6">
          {errorMessage}
        </p>
      )}

      <div className="mt-8 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            if (!hasChanges || confirmDiscardDraft()) router.push(`/community/${postId}`);
          }}
          className="text-ink cursor-pointer text-[16px]"
        >
          취소
        </button>
        <button
          type="submit"
          aria-disabled={isSaving || undefined}
          className="bg-highlight text-ink hover:bg-primary-300 cursor-pointer rounded-[10px] px-4 py-2 text-[16px] font-medium transition-colors"
        >
          {isSaving ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </form>
  );
};

export default CommunityPostEditForm;
