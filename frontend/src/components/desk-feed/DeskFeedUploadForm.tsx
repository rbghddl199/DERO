'use client';
// 사진 올리기 — **post 작성 폼과 동형이다**(D34·ADR-0037): 제목(필수) + 마크다운 본문(필수)에
// 사진이 인라인으로 들어간다.
//
// 다만 **사진이 여전히 주인공이라 업로드 존을 폼 맨 위에 크게 둔다** — 커뮤니티 작성 폼은 툴바의
// 작은 이미지 버튼뿐이다. 존에서 고른 사진은 본문 끝에 이어 꽂히고(`insertImages`), 그 아래
// 썸네일 줄은 **본문에 실제로 남아 있는 사진만** 비춘다.
//
// **사진의 정본은 본문 마크다운이다**(BE: `![alt](key)` 위치가 정본). 그래서 썸네일 줄에 삭제 버튼을
// 두지 않았다 — 지우는 곳이 두 곳이 되면 어느 쪽이 진짜인지 갈린다. 사진을 빼려면 본문에서 그
// 이미지를 지운다(Tiptap 노드라 선택 후 Backspace). 본문에서 사라진 사진은 업로드 자체를 하지 않는다.
//
// 게시는 3단계다(presign이 글 존재를 요구한다 — CommunityEditor와 같은 순서): ① `POST /desk-feeds`로
// 글을 먼저 만들고(본문은 아직 blob 미리보기 주소를 물고 있다) ② presign 업로드 + 등록
// ③ 본문의 blob URL을 **imageKey**로 치환해 PUT — 본문에 박는 것은 언제나 key다(URL이 아니라). 목록 카드 표지는 서버가 **본문 첫 이미지**에서 파생하므로 여기서 표지를
// 고르지 않는다(D34·ADR-0037).
//
// 사진별 제품 태그(ADR-0040)는 ④로 따라붙는다 — imageId가 ②에서야 생기므로 그 전까지는 blob
// 미리보기 주소로 들고 있다가, 글 단위 목록이 저장된 뒤(③) 사진마다 PUT한다(그 목록 밖 제품은 422).
//
// ②③④가 실패하면 사진 0장 글이 남으므로 best-effort로 지운다 — 사진 없는 글은 서버가 목록에서 숨겨
// 사용자에겐 사라진 글이 된다.

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  createDeskFeed,
  deleteDeskFeed,
  replaceDeskFeedImageProducts,
  updateDeskFeed,
  uploadDeskFeedImages,
} from '@/api/deskFeed';
import InlineNotice from '@/components/common/InlineNotice';
import { toImageAlt } from '@/components/community/communityContent';
import PostRichEditor, { type PostRichEditorHandle } from '@/components/community/PostRichEditor';
import {
  DESK_FEED_MAX_IMAGES,
  DESK_FEED_MAX_TAGS,
  DESK_FEED_TITLE_MAX_LENGTH,
} from '@/constants/deskFeed';
import { POST_IMAGE_ACCEPT_ATTRIBUTE } from '@/constants/post';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { confirmDiscardDraft, useUnsavedDraftGuard } from '@/hooks/useUnsavedDraftGuard';

import { toPostSaveErrorMessage } from '@/utils/postError';
import type { DeskFeedProductSummaryResponse } from '@/types/deskFeed';
import DeskFeedPhotoProductTagger from './DeskFeedPhotoProductTagger';
import DeskFeedProductPicker from './DeskFeedProductPicker';

const MIN_TITLE_LENGTH = 2;

/** 미리보기 URL은 파일과 한 몸이다 — 본문 문자열이 이 URL로 파일을 되찾는다. */
type PickedImage = {
  file: File;
  previewUrl: string;
};

const DeskFeedUploadForm = () => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [products, setProducts] = useState<DeskFeedProductSummaryResponse[]>([]);
  // 본문에서 고른 사진의 미리보기 주소 — 그 사진의 제품 태그 패널이 이 값으로 열린다(ADR-0040).
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  /**
   * 사진별 제품 태그(ADR-0040) — **미리보기 주소로 센다**. 작성은 3단계라 imageId가 생기는 시점이
   * 게시 직전이고, 그때까지 사진을 가리키는 유일한 이름이 이 blob 주소다. 게시 뒤 업로드 결과와
   * 짝지어 `PUT .../images/{imageId}/products`로 내보낸다.
   */
  const [photoProductIds, setPhotoProductIds] = useState<ReadonlyMap<string, number[]>>(new Map());
  // 렌더에 쓰인다(썸네일 줄) — CommunityEditor의 ref와 달리 state여야 한다.
  const [pickedImages, setPickedImages] = useState<PickedImage[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const richEditorRef = useRef<PostRichEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // **본문에 남아 있는 사진만 센다** — 넣었다 지운 파일까지 세면 상한을 헛되게 잡아먹고, 저장 때
  // 업로드하지도 않을 사진으로 "30장 초과"가 뜬다.
  const bodyImages = pickedImages.filter((image) => content.includes(image.previewUrl));

  const hasDraft =
    title.trim() !== '' ||
    content.trim() !== '' ||
    tags.length > 0 ||
    tagInput.trim() !== '' ||
    products.length > 0;
  useUnsavedDraftGuard(hasDraft && !isSubmitting);

  /** 사진에 붙인 제품을 글 단위 목록과 사진별 표 양쪽에 반영한다(ADR-0040 결정 2). */
  const applyPhotoProductTags = (next: {
    products: DeskFeedProductSummaryResponse[];
    productIds: number[];
  }): void => {
    const src = selectedImageSrc;
    if (src === null) return;
    setProducts(next.products);
    setPhotoProductIds((prev) => new Map(prev).set(src, next.productIds));
  };

  /** 툴바의 단건 삽입도 이 경로를 쓴다 — 어느 쪽으로 넣어도 blob↔File 짝이 한 곳에 모인다. */
  const registerImage = (file: File): string => {
    const previewUrl = URL.createObjectURL(file);
    setPickedImages((prev) => [...prev, { file, previewUrl }]);
    return previewUrl;
  };

  // 화면을 떠날 때 미리보기 주소를 전부 회수한다 — 게시 성공 경로에서만 풀면, 도중에 나가거나
  // 본문에서 뺀 사진의 blob이 문서 수명 내내 파일을 붙잡는다(수정 폼과 같은 처방).
  const pickedImagesRef = useRef<PickedImage[]>([]);
  // 렌더 중에는 ref를 못 건드린다(react-hooks 규칙) — 목록이 바뀔 때마다 효과로 옮겨 적는다.
  useEffect(() => {
    pickedImagesRef.current = pickedImages;
  }, [pickedImages]);
  useEffect(
    () => () => {
      pickedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    [],
  );

  const handlePickFiles = (fileList: FileList | null) => {
    if (fileList === null || fileList.length === 0) return;
    // 상한을 넘는 만큼은 조용히 버리지 않고 아래 안내 문구가 이유를 말한다.
    const room = Math.max(DESK_FEED_MAX_IMAGES - bodyImages.length, 0);
    const picked = Array.from(fileList).slice(0, room);
    richEditorRef.current?.insertImages(
      picked.map((file) => ({ src: registerImage(file), alt: toImageAlt(file.name) })),
    );
    // 같은 파일을 다시 고를 수 있게 입력값을 비운다.
    if (fileInputRef.current !== null) fileInputRef.current.value = '';
  };

  const isTagLimitReached = tags.length >= DESK_FEED_MAX_TAGS;

  const addTag = () => {
    const next = tagInput.trim().replace(/^#/, '');
    if (!next) return;
    // 한도에 걸렸으면 입력한 글자를 지우지 않는다 — 조용히 사라지면 왜 안 들어갔는지 알 수 없다.
    if (isTagLimitReached) return;
    setTags((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setTagInput('');
  };

  const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

  // 파생 상태라 렌더 중에 계산한다(CommunityEditor와 같은 형태)
  const errors: { title?: string; content?: string; images?: string } = {};
  if (title.trim().length < MIN_TITLE_LENGTH) {
    errors.title = `제목을 ${MIN_TITLE_LENGTH}자 이상 입력해주세요.`;
  }
  if (content.trim() === '') {
    errors.content = '본문을 입력해주세요.';
  }
  if (bodyImages.length === 0) {
    errors.images = '책상 사진을 1장 이상 올려주세요.';
  } else if (bodyImages.length > DESK_FEED_MAX_IMAGES) {
    errors.images = `사진은 한 글에 ${DESK_FEED_MAX_IMAGES}장까지만 넣을 수 있어요.`;
  }
  const isValid = Object.keys(errors).length === 0;
  const visibleErrors = hasAttemptedSubmit ? errors : {};

  const submit = async (): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);
    const trimmedTitle = title.trim();
    const draftContent = content.trim();
    const productIds = products.map((product) => product.id);
    let createdId: number | null = null;
    try {
      const created = await createDeskFeed({
        title: trimmedTitle,
        content: draftContent,
        hashtags: tags,
        placementId: null,
        productIds,
      });
      createdId = created.id;

      const uploaded = await uploadDeskFeedImages(
        created.id,
        bodyImages.map((image) => image.file),
      );
      let finalContent = draftContent;
      uploaded.forEach((image, index) => {
        finalContent = finalContent.split(bodyImages[index].previewUrl).join(image.imageKey);
      });
      await updateDeskFeed(created.id, {
        title: trimmedTitle,
        content: finalContent,
        hashtags: tags,
        placementId: null,
        productIds,
      });

      // 사진별 제품 태그는 **글 단위 목록이 저장된 뒤**에 보낸다 — 그 목록 밖 제품은 422다
      // (ADR-0040 결정 2). 여기서 실패하면 아래 catch가 글까지 되돌린다: 태그만 빠진 글을
      // 남기면 사용자가 붙인 태그가 조용히 사라진 것으로 보인다.
      // **글 목록에서 빠진 제품은 걸러낸다** — 태그를 붙인 뒤 아래 피커에서 그 제품을 빼면
      // 화면에는 이미 안 보이는데(칩은 글 목록에서 찾아 그린다) 그대로 보내면 422로 죽는다.
      const inList = new Set(productIds);
      await Promise.all(
        uploaded.map((image, index) => {
          const tagged = (photoProductIds.get(bodyImages[index].previewUrl) ?? []).filter((id) =>
            inList.has(id),
          );
          return tagged.length === 0
            ? Promise.resolve()
            : replaceDeskFeedImageProducts(created.id, image.id, tagged);
        }),
      );

      pickedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      // replace: 게시 후 상세에서 뒤로 가면 작성 페이지가 아니라 목록으로 가야 한다.
      router.replace(`/desk-feed/${created.id}`);
    } catch (error) {
      console.error('[DeskFeedUploadForm] 업로드에 실패했습니다', error);
      // 사진 0장 글은 성립하지 않는다 — 롤백 실패는 무시한다(재시도하면 새 글이 된다).
      if (createdId !== null) void deleteDeskFeed(createdId).catch(() => undefined);
      setSubmitError(toPostSaveErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!isValid) {
      setHasAttemptedSubmit(true);
      if (errors.title) titleRef.current?.focus();
      else if (errors.content) richEditorRef.current?.focus();
      return;
    }
    if (!requireAuth()) return;
    void submit();
  };

  return (
    <form onSubmit={handleSubmit} className="font-swiss tracking-[-0.03em]">
      <h1 className="text-ink mb-6 text-[26px] leading-[1.2] font-medium sm:text-[32px]">
        사진 올리기
      </h1>

      <div className="flex flex-col gap-6">
        {/* 사진 존을 맨 위에 크게 — 사진이 본체인 도메인이라 폼의 첫 동작이 사진 고르기여야 한다. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            책상 사진 <span className="text-danger-500">*</span>
          </span>
          <p className="text-ash text-[13px]">
            최대 {DESK_FEED_MAX_IMAGES}장. 고른 사진은 본문에 이어 붙고, 본문에 먼저 나오는 사진이
            갤러리 카드의 대표 사진이 됩니다. 본문에 끌어다 놓거나 붙여넣어도 됩니다.
          </p>

          {/* label이 input을 감싸므로 클릭 처리에 JS가 필요 없다. */}
          <label
            className={`border-ash/40 hover:border-ink mt-1 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              visibleErrors.images !== undefined ? 'border-danger-500' : ''
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              // presign이 받는 MIME 넷만 — `image/*`로 두면 heic 같은 걸 고른 뒤 업로드에서 400이 난다
              accept={POST_IMAGE_ACCEPT_ATTRIBUTE}
              multiple
              onChange={(event) => handlePickFiles(event.target.files)}
              disabled={bodyImages.length >= DESK_FEED_MAX_IMAGES}
              className="hidden"
            />
            <span className="text-ink text-[17px] font-medium">
              {bodyImages.length >= DESK_FEED_MAX_IMAGES
                ? `사진은 ${DESK_FEED_MAX_IMAGES}장까지 올릴 수 있어요`
                : '여기를 눌러 책상 사진 올리기'}
            </span>
            <span className="text-ash text-[13px] tabular-nums">
              {bodyImages.length}/{DESK_FEED_MAX_IMAGES}
            </span>
          </label>

          {/* 본문에 남아 있는 사진만 비춘다 — 삭제 버튼이 없는 이유는 파일 상단 주석 참고. */}
          {bodyImages.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {bodyImages.map((image, index) => (
                <li
                  key={image.previewUrl}
                  className="border-ash/30 relative overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: 미리보기라 최적화 대상이 아니다 */}
                  <img
                    src={image.previewUrl}
                    alt={`올릴 사진 ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  {index === 0 && (
                    <span className="bg-ink text-paper absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px]">
                      대표
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {visibleErrors.images !== undefined && (
            <p role="alert" className="text-danger-700 text-[13px] leading-5">
              {visibleErrors.images}
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            제목 <span className="text-danger-500">*</span>
          </span>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={DESK_FEED_TITLE_MAX_LENGTH}
            placeholder="예) 3년 쓴 원목 책상, 모니터암 달고 넓어졌어요"
            aria-invalid={visibleErrors.title ? true : undefined}
            className={`bg-paper text-ink placeholder:text-ash rounded-[10px] border px-3 py-2 text-[16px] outline-none ${
              visibleErrors.title ? 'border-danger-500' : 'border-ash/40'
            }`}
          />
          {visibleErrors.title && (
            <p role="alert" className="text-danger-700 text-[13px] leading-5">
              {visibleErrors.title}
            </p>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            본문 <span className="text-danger-500">*</span>
          </span>
          {/* `@` 멘션은 데스크피드에서만 켠다 — 커뮤니티 게시글 멘션은 부결이고(ADR-0038
              Out of Scope), 거기서 켜면 해석표를 안 받는 화면에 토큰이 날것으로 남는다. */}
          <PostRichEditor
            ref={richEditorRef}
            onChange={setContent}
            onSelectImage={registerImage}
            hasError={Boolean(visibleErrors.content)}
            enableMention
            onSelectedImageChange={setSelectedImageSrc}
          />
          {visibleErrors.content && (
            <p role="alert" className="text-danger-700 text-[13px] leading-5">
              {visibleErrors.content}
            </p>
          )}
          {/* 본문에서 사진을 고르면 그 사진의 제품 태그 패널이 열린다(ADR-0040 결정 5). */}
          <DeskFeedPhotoProductTagger
            isImageSelected={selectedImageSrc !== null}
            productIds={
              selectedImageSrc === null ? [] : (photoProductIds.get(selectedImageSrc) ?? [])
            }
            products={products}
            onChange={applyPhotoProductTags}
          />
        </div>

        {/* 작성 화면에는 배치 첨부 피커가 없다(ADR-0033 결정 4: 수정 화면뿐) — 그래서
            "배치에서 제품 불러오기"도 여기선 뜨지 않는다. */}
        <DeskFeedProductPicker selected={products} onChange={setProducts} />

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[14px] font-medium">
            태그 <span className="text-ash font-normal">(최대 {DESK_FEED_MAX_TAGS}개)</span>
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
              disabled={isTagLimitReached}
              placeholder={tags.length === 0 ? '예) 원목데스크, 미니멀셋업' : ''}
              className="text-ink placeholder:text-ash min-w-[120px] flex-1 py-0.5 text-[14px] outline-none disabled:cursor-not-allowed"
            />
          </div>
          {/* disabled만 걸면 끝인지 고장인지 구분이 안 된다 — 이유를 글로 알린다. */}
          <p className="text-ash text-[13px]">
            {isTagLimitReached
              ? `태그는 최대 ${DESK_FEED_MAX_TAGS}개까지 넣을 수 있어요.`
              : `${tags.length}/${DESK_FEED_MAX_TAGS}`}
          </p>
        </label>
      </div>

      {submitError && (
        <div className="mt-4">
          <InlineNotice variant="error" message={submitError} />
        </div>
      )}

      {/* 모바일에선 두 버튼을 한 줄 가득 반씩 — 좁은 화면에서 오른쪽 끝 몰림보다 누르기 쉽다. */}
      <div className="mt-6 flex items-center gap-3 sm:justify-end">
        <button
          type="button"
          onClick={() => {
            if (!hasDraft || confirmDiscardDraft()) router.push('/desk-feed');
          }}
          className="border-ash/20 text-ink hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors sm:min-w-[140px] sm:flex-none"
        >
          나가기
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[140px] sm:flex-none"
        >
          {isSubmitting ? '올리는 중...' : '게시하기'}
        </button>
      </div>
    </form>
  );
};

export default DeskFeedUploadForm;
