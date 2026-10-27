'use client';
// 데스크피드 수정 — 제목·본문·태그·배치 첨부/해제·제품 태그를 한 번의 PUT으로 보낸다.
// **전체 교체 의미론이다**: 배치 피커를 비우면 첨부 해제고, 제품 태그를 다 떼면 빈 배열로 나간다.
//
// **본문은 작성 폼과 같은 위지윅이다**(`PostRichEditor`) — `parseEditorContent`가 저장 문자열을
// 다시 Tiptap 문서로 되돌려 준다. 작성은 위지윅인데 수정만 마크다운 원문이던 시절의 자국이
// 남아 있으면(썸네일 줄이 미리보기를 대신한다는 식) 그건 옛 주석이다.
//
// **사진은 PUT에 실리지 않는다**(D34·ADR-0037) — 등록·삭제 엔드포인트가 관리하고 본문 안
// `![alt](key)` 위치가 정본이다. 그래서 여기선 ①고르는 즉시 업로드해 `![name](imageKey)`를 본문
// 끝에 붙이고 ②삭제 버튼은 서버 사진을 지운 뒤 본문에서 그 마크다운도 같이 뗀다. 한쪽만 하면
// 본문에 죽은 key가 남거나(렌더 실패) DB에 고아 사진이 남아 30장 상한을 헛되게 먹는다.
//
// 본문에 넣는 것은 URL이 아니라 **key**다 — 화면이 `images`의 (key → URL) 맵으로 렌더 시점에
// 해석한다(URL 조립 규칙이 바뀌어도 본문은 그대로다). 에디터에는 그 맵을 `imageUrls`로 넘겨
// 사진이 보이게 하고, 저장 문자열로 돌아올 땐 PostRichEditor가 URL을 다시 key로 되돌린다.
//
// 배치 피커에 뜨는 건 **본인 소유 + PUBLIC 배치뿐**이다(D25와 같은 규칙) — 서버도 같은 조건으로
// 검증하고 어기면 422다. 비공개 배치를 허용하면 공개 글 안에 열람 불가 배치가 생겨 클릭이 404가
// 된다(ADR-0033 결정 3).

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ApiError } from '@/api/client';
import {
  deleteDeskFeedImage,
  getDeskFeed,
  replaceDeskFeedImageProducts,
  updateDeskFeed,
  uploadDeskFeedImages,
} from '@/api/deskFeed';
import { listPlacements } from '@/api/placement';
import InlineNotice from '@/components/common/InlineNotice';
import PostRichEditor, { type PostRichEditorHandle } from '@/components/community/PostRichEditor';
import {
  DESK_FEED_MAX_IMAGES,
  DESK_FEED_MAX_TAGS,
  DESK_FEED_TITLE_MAX_LENGTH,
} from '@/constants/deskFeed';
import { POST_IMAGE_ACCEPT_ATTRIBUTE } from '@/constants/post';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { confirmDiscardDraft, useUnsavedDraftGuard } from '@/hooks/useUnsavedDraftGuard';
import { removeImageMarkdown, toImageAlt } from '@/components/community/communityContent';

import { toPostSaveErrorMessage } from '@/utils/postError';
import type { DeskFeedImageResponse, DeskFeedProductSummaryResponse } from '@/types/deskFeed';
import type { PlacementSummaryResponse } from '@/types/placement';
import DeskFeedPhotoProductTagger from './DeskFeedPhotoProductTagger';
import DeskFeedProductPicker from './DeskFeedProductPicker';

const MIN_TITLE_LENGTH = 2;

type Props = {
  deskFeedId: number;
};

const DeskFeedEditForm = ({ deskFeedId }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [placementId, setPlacementId] = useState<number | null>(null);
  const [placements, setPlacements] = useState<PlacementSummaryResponse[]>([]);
  const [products, setProducts] = useState<DeskFeedProductSummaryResponse[]>([]);
  // 본문에서 고른 사진의 src — 그 사진의 제품 태그 패널이 이 값으로 열린다(ADR-0040).
  // 에디터가 보여주는 값이라 서버 사진이면 imageUrl, 방금 떨어뜨린 사진이면 blob 주소다.
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  /** 서버에 저장된 사진 — 상한 판정도 (key → URL) 해석도 이 목록 기준이다. */
  const [serverImages, setServerImages] = useState<DeskFeedImageResponse[]>([]);
  /**
   * 사진별 제품 태그 중 **사용자가 고친 것만**(imageId → 제품 id, ADR-0040). 안 건드린 사진은
   * `serverImages`의 값이 그대로 정본이라 여기 없고, 그래서 이 표가 곧 저장 대상 목록이다.
   */
  const [photoProductEdits, setPhotoProductEdits] = useState<ReadonlyMap<number, number[]>>(
    new Map(),
  );
  /**
   * 본문 `[[user:ID]]` 자리에 그릴 닉네임(D35·ADR-0038). 서버가 준 해석표로 시작하고, 편집 중
   * 새로 고른 후보를 여기 **먼저** 더한다 — 안 그러면 그 뒤 재파싱에서 "@알 수 없음"이 된다.
   */
  const [mentions, setMentions] = useState<ReadonlyMap<number, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const richEditorRef = useRef<PostRichEditorHandle>(null);
  /** 나가기 경고 판정용 원본 스냅샷 — 로드 직후 값과 같으면 고친 게 없다. */
  const [initial, setInitial] = useState({
    title: '',
    content: '',
    tags: '',
    placementId: null as number | null,
    productIds: '',
  });

  useEffect(() => {
    let cancelled = false;
    getDeskFeed(deskFeedId)
      .then((detail) => {
        if (cancelled) return;
        setTitle(detail.title);
        setContent(detail.content);
        setTags(detail.hashtags);
        setPlacementId(detail.placementId);
        setProducts(detail.usedProducts);
        setServerImages(detail.images);
        setMentions(new Map(detail.mentions.map((mention) => [mention.userId, mention.nickname])));
        setInitial({
          title: detail.title,
          content: detail.content,
          tags: detail.hashtags.join(' '),
          placementId: detail.placementId,
          productIds: detail.usedProducts.map((product) => product.id).join(' '),
        });
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [deskFeedId]);

  // 첨부 후보 — 본인 PUBLIC 배치만. 실패해도 수정 자체는 되어야 하므로 폼을 막지 않는다.
  useEffect(() => {
    let cancelled = false;
    listPlacements({ owner: 'me', publishStatus: 'PUBLIC', size: 50 })
      .then((page) => {
        if (!cancelled) setPlacements(page.content);
      })
      .catch((error: unknown) => {
        console.error('[DeskFeedEditForm] 배치 목록을 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 썸네일 줄은 **본문에 실제로 걸린 사진만** 비춘다 — 본문에서 마크다운만 지운 사진은 아직 서버에
  // 남아 상한을 먹지만 글에는 안 보인다. 그 사실을 아래 문구가 말한다.
  const bodyImages = serverImages.filter((image) => content.includes(image.imageKey));
  const isImageLimitReached = serverImages.length >= DESK_FEED_MAX_IMAGES;
  // 에디터에 실을 (key → URL) 해석표 — 본문 정본은 key라서 표시할 때만 URL로 바꾼다.
  const imageUrls = useMemo(
    () => new Map(serverImages.map((image) => [image.imageKey, image.imageUrl])),
    [serverImages],
  );

  // 에디터가 준 src로 서버 사진을 되찾는다 — 본문 정본은 key인데 에디터에는 URL로 실려 있어
  // 둘 다로 찾는다(아직 안 올라간 blob 주소는 어느 쪽에도 안 걸려 패널이 안 열린다).
  const selectedImage =
    selectedImageSrc === null
      ? undefined
      : serverImages.find(
          (image) => image.imageUrl === selectedImageSrc || image.imageKey === selectedImageSrc,
        );
  const selectedProductIds =
    selectedImage === undefined
      ? []
      : (photoProductEdits.get(selectedImage.id) ?? selectedImage.productIds);

  // 업로드가 끝난 뒤 콜백이 읽어야 하는 값들 — 그 사이 사용자가 계속 타이핑하므로 최신을 본다.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  /** 업로드 중인 장수 — 한 렌더에서 여러 장이 들어오므로 상태로는 못 센다. */
  const inFlightImagesRef = useRef(0);
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  /**
   * 본문 문자열과 에디터 문서를 함께 갈아끼운다 — 사진 조작(추가·교체·삭제)은 전부 이 경로를 지난다.
   *
   * 에디터를 **효과에서** 건드리는 것이 핵심이다: `serverImages`가 반영된 렌더 뒤여야
   * `PostRichEditor`의 (key → URL) 해석표가 최신이고, 그래야 방금 올린 사진이 깨진 채로 뜨지 않는다
   * (자식 효과가 부모 효과보다 먼저 돈다).
   */
  const pendingBodyRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingBodyRef.current === null) return;
    richEditorRef.current?.setContent(pendingBodyRef.current);
    pendingBodyRef.current = null;
  }, [content]);
  /** 사진에 붙인 제품을 글 단위 목록과 사진별 표 양쪽에 반영한다(ADR-0040 결정 2).
   *  **저장은 여기서 하지 않는다** — 글 단위 목록이 먼저 저장돼야 서버가 422를 안 낸다. */
  const applyPhotoProductTags = (next: {
    products: DeskFeedProductSummaryResponse[];
    productIds: number[];
  }): void => {
    const imageId = selectedImage?.id;
    if (imageId === undefined) return;
    setProducts(next.products);
    setPhotoProductEdits((prev) => new Map(prev).set(imageId, next.productIds));
  };

  const replaceBody = (next: string) => {
    // 바뀐 게 없으면 아무것도 예약하지 않는다 — setContent가 리렌더를 걸러 효과가 안 돌면,
    // 예약이 남아 있다가 **한참 뒤 타자 한 번에** 그 시점 본문으로 되돌려 버린다.
    if (next === contentRef.current) return;
    // 렌더를 기다리지 않고 즉시 최신화한다 — 사진 두 장을 같이 떨어뜨리면 두 업로드가 같은 틱에
    // 끝나는데, 여기서 갱신하지 않으면 뒤엣놈이 앞엣놈의 치환을 덮어써 blob 주소가 저장된다.
    contentRef.current = next;
    pendingBodyRef.current = next;
    setContent(next);
  };

  /**
   * 본문에 끌어다 놓거나 붙여넣은 사진 — 미리보기 주소를 먼저 **그 자리에** 꽂고, 업로드가 끝나면
   * 그 자리의 주소만 imageKey로 바꾼다(작성 폼은 저장 시점에 한꺼번에 치환하지만, 수정 화면은 글이
   * 이미 있어 바로 올릴 수 있다). 실패하면 죽은 blob이 본문에 남지 않게 그 마크다운을 뗀다.
   */
  const registerDroppedImage = (file: File): string => {
    const previewUrl = URL.createObjectURL(file);
    // 미리보기 주소는 **화면을 떠날 때** 회수한다 — 여기서 업로드 직후에 풀면 에디터가 그 자리를
    // 실제 주소로 바꾸기 전에 끊겨 사진이 잠깐 깨져 보인다.
    previewUrlsRef.current.push(previewUrl);
    // 여러 장을 한 번에 떨어뜨리면 이 함수가 같은 렌더에서 연달아 불린다 — 예약 장수를 즉시 세지
    // 않으면 셋 다 상한 검사를 통과하고 서버가 422로 두 장을 되돌려준다.
    inFlightImagesRef.current += 1;
    void uploadDroppedImage(file, previewUrl);
    return previewUrl;
  };

  const uploadDroppedImage = async (file: File, previewUrl: string): Promise<void> => {
    setIsUploading(true);
    try {
      if (serverImages.length + inFlightImagesRef.current > DESK_FEED_MAX_IMAGES) {
        throw new RangeError(`사진은 ${DESK_FEED_MAX_IMAGES}장까지만 넣을 수 있어요.`);
      }
      const [uploaded] = await uploadDeskFeedImages(deskFeedId, [file]);
      setServerImages((prev) => [...prev, uploaded]);
      replaceBody(contentRef.current.split(previewUrl).join(uploaded.imageKey));
    } catch (error) {
      console.error('[DeskFeedEditForm] 사진 업로드에 실패했습니다', error);
      setErrorMessage(error instanceof RangeError ? error.message : toPostSaveErrorMessage(error));
      replaceBody(removeImageMarkdown(contentRef.current, previewUrl));
    } finally {
      inFlightImagesRef.current -= 1;
      setIsUploading(false);
    }
  };

  const handlePickFiles = async (fileList: FileList | null): Promise<void> => {
    if (fileList === null || fileList.length === 0) return;
    // 상한은 **서버에 저장된 장수** 기준이다 — presign이 그 시점의 DB 행 수 + 요청 수로 판단한다
    // (DeskFeedService.requireWithinImageLimit). 화면 기준으로 세면 422로 죽는다.
    const room = Math.max(
      DESK_FEED_MAX_IMAGES - serverImages.length - inFlightImagesRef.current,
      0,
    );
    const files = Array.from(fileList).slice(0, room);
    if (fileInputRef.current !== null) fileInputRef.current.value = '';
    if (files.length === 0) {
      setErrorMessage(`사진은 ${DESK_FEED_MAX_IMAGES}장까지만 넣을 수 있어요.`);
      return;
    }
    setIsUploading(true);
    // 상한을 넘은 만큼은 조용히 버리지 않는다 — 몇 장이 올라갔는지 말한다.
    setErrorMessage(
      files.length < fileList.length
        ? `사진은 ${DESK_FEED_MAX_IMAGES}장까지만 넣을 수 있어 ${files.length}장만 올렸어요.`
        : null,
    );
    try {
      const uploaded = await uploadDeskFeedImages(deskFeedId, files);
      setServerImages((prev) => [...prev, ...uploaded]);
      const markdown = uploaded
        .map((image, index) => `![${toImageAlt(files[index].name)}](${image.imageKey})`)
        .join('\n\n');
      replaceBody(`${contentRef.current.trimEnd()}\n\n${markdown}\n`);
    } catch (error) {
      console.error('[DeskFeedEditForm] 사진 업로드에 실패했습니다', error);
      setErrorMessage(toPostSaveErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 서버 사진을 지우고 본문의 그 마크다운도 같이 뗀다 — 한쪽만 하면 정본이 갈린다.
   *
   * <b>본문 정리를 먼저 저장하고 그 다음에 사진을 지운다</b>. 반대로 하면 사용자가 삭제 직후
   * 화면을 떠났을 때 저장된 본문에 죽은 key가 남아 글이 깨진 채로 남는다. 이 순서면 실패해도
   * 남는 것은 본문에 안 걸린 고아 레지스트리 행뿐이고(상한만 먹는다), 마지막 한 장을 지우려 하면
   * 본문 이미지 0장이라 서버가 422로 막는다 — 최소 1장 게이트가 여기서도 그대로 선다.
   */
  const handleDeleteImage = async (image: DeskFeedImageResponse): Promise<void> => {
    if (!window.confirm('이 사진을 지울까요? 되돌릴 수 없습니다.')) return;
    setErrorMessage(null);
    const nextContent = removeImageMarkdown(content, image.imageKey);
    try {
      await updateDeskFeed(deskFeedId, {
        title,
        content: nextContent,
        hashtags: tags,
        placementId,
        productIds: products.map((product) => product.id),
      });
      // 본문 밖(썸네일 줄)에서 지운 것이라 에디터 문서도 같이 갈아끼워야 한다 — 안 하면 지운 사진이
      // 화면에 그대로 남아 있다가 다음 편집에서 되살아난다.
      replaceBody(nextContent);
      await deleteDeskFeedImage(deskFeedId, image.id);
      setServerImages((prev) => prev.filter((it) => it.id !== image.id));
      // 사진이 사라지면 태그도 FK CASCADE로 사라진다 — 예약을 안 지우면 저장 때 없는 사진에
      // PUT을 쳐서 404가 난다.
      setPhotoProductEdits((prev) => {
        if (!prev.has(image.id)) return prev;
        const next = new Map(prev);
        next.delete(image.id);
        return next;
      });
    } catch (error) {
      console.error('[DeskFeedEditForm] 사진을 지우지 못했습니다', error);
      setErrorMessage(toPostSaveErrorMessage(error));
    }
  };

  const isTagLimitReached = tags.length >= DESK_FEED_MAX_TAGS;

  const addTag = () => {
    const next = tagInput.trim().replace(/^#/, '');
    if (!next) return;
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
    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  // 고친 게 있으면 이탈을 막는다 — 작성 폼과 같은 관례.
  const isDirty =
    title !== initial.title ||
    content !== initial.content ||
    tags.join(' ') !== initial.tags ||
    placementId !== initial.placementId ||
    products.map((product) => product.id).join(' ') !== initial.productIds ||
    photoProductEdits.size > 0 ||
    tagInput.trim() !== '';
  useUnsavedDraftGuard(isDirty && !isSubmitting);

  const submit = async (): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const savedProductIds = products.map((product) => product.id);
    try {
      await updateDeskFeed(deskFeedId, {
        title: title.trim(),
        content: content.trim(),
        hashtags: tags,
        placementId,
        productIds: savedProductIds,
      });
      // 사진별 제품 태그는 글 단위 목록이 저장된 **뒤**에 보낸다 — 그 목록 밖 제품은 422다
      // (ADR-0040 결정 2). 고친 사진만 나가고, 빈 배열이 곧 "태그 없음"이다.
      // **글 목록에서 빠진 제품은 걸러낸다** — 태그를 붙인 뒤 아래 피커에서 그 제품을 빼면
      // 화면에는 이미 안 보이는데(칩은 글 목록에서 찾아 그린다) 그대로 보내면 422로 죽는다.
      const inList = new Set(savedProductIds);
      await Promise.all(
        [...photoProductEdits].map(([imageId, productIds]) =>
          replaceDeskFeedImageProducts(
            deskFeedId,
            imageId,
            productIds.filter((id) => inList.has(id)),
          ),
        ),
      );
      router.replace(`/desk-feed/${deskFeedId}`);
    } catch (error) {
      console.error('[DeskFeedEditForm] 수정에 실패했습니다', error);
      const status = error instanceof ApiError ? error.status : undefined;
      setErrorMessage(
        status === 403 ? '내 사진만 수정할 수 있어요.' : toPostSaveErrorMessage(error),
      );
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (title.trim().length < MIN_TITLE_LENGTH) {
      setErrorMessage(`제목을 ${MIN_TITLE_LENGTH}자 이상 입력해주세요.`);
      return;
    }
    if (content.trim() === '') {
      setErrorMessage('본문을 입력해주세요.');
      return;
    }
    if (bodyImages.length === 0) {
      setErrorMessage('사진을 최소 1장은 남겨야 해요.');
      return;
    }
    if (!requireAuth()) return;
    void submit();
  };

  if (loadState === 'loading') {
    return <p className="text-ash py-16 text-center text-[15px]">불러오는 중...</p>;
  }

  if (loadState === 'error') {
    return (
      <InlineNotice
        variant="error"
        title="사진을 불러오지 못했습니다"
        message="삭제됐거나 주소가 잘못됐을 수 있어요."
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="font-swiss tracking-[-0.03em]">
      <h1 className="text-ink mb-6 text-[26px] leading-[1.2] font-medium sm:text-[32px]">
        사진 수정
      </h1>

      <div className="flex flex-col gap-6">
        {/* 사진 존을 맨 위에 크게 — 사진이 본체인 도메인이라 작성 폼과 같은 자리에 둔다. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            책상 사진 <span className="text-danger-500">*</span>
          </span>
          <p className="text-ash text-[13px]">
            최대 {DESK_FEED_MAX_IMAGES}장. 추가한 사진은 본문 끝에 붙고, 위치는 아래 본문에서 옮길
            수 있어요.
          </p>

          <label
            className={`border-ash/40 mt-1 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isImageLimitReached || isUploading
                ? 'cursor-not-allowed'
                : 'hover:border-ink cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              // presign이 받는 MIME 넷만 — `image/*`로 두면 heic 같은 걸 고른 뒤 업로드에서 400이 난다
              accept={POST_IMAGE_ACCEPT_ATTRIBUTE}
              multiple
              onChange={(event) => void handlePickFiles(event.target.files)}
              disabled={isImageLimitReached || isUploading}
              className="hidden"
            />
            <span className="text-ink text-[17px] font-medium">
              {isUploading
                ? '올리는 중...'
                : isImageLimitReached
                  ? `사진은 ${DESK_FEED_MAX_IMAGES}장까지 올릴 수 있어요`
                  : '여기를 눌러 사진 추가'}
            </span>
            <span className="text-ash text-[13px] tabular-nums">
              {serverImages.length}/{DESK_FEED_MAX_IMAGES}
            </span>
          </label>

          {bodyImages.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {bodyImages.map((image, index) => (
                <li
                  key={image.id}
                  className="border-ash/30 relative overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 사용자 사진이라 plain img를 쓴다(next/image 전환은 별건) */}
                  <img
                    src={image.imageUrl}
                    alt={`사진 ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  {/* 대표 뱃지가 없는 것이 의도다 — 대표는 본문 첫 이미지에서 파생하므로
                      여기서 고를 것이 없다(D34·ADR-0037: 대표 선택 UI 부결). */}
                  <button
                    type="button"
                    onClick={() => void handleDeleteImage(image)}
                    aria-label={`사진 ${index + 1} 삭제`}
                    className="bg-ink/70 text-paper hover:bg-danger-500 absolute top-1.5 right-1.5 h-6 w-6 cursor-pointer rounded-full text-[13px] leading-none transition-colors"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 본문에서 마크다운만 지워진 사진은 화면에 없지만 서버에 남아 상한을 먹는다 — 그 상태를
              숫자만으로는 알 수 없어 문장으로 알린다. */}
          {serverImages.length > bodyImages.length && (
            <p className="text-ash text-[13px]">
              본문에서 빠진 사진 {serverImages.length - bodyImages.length}장이 서버에 남아 장수를
              차지하고 있어요. 다시 쓰려면 본문에 마크다운을 되살리고, 아니면 위에서 지워주세요.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            제목 <span className="text-danger-500">*</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={DESK_FEED_TITLE_MAX_LENGTH}
            className="border-ash/40 bg-paper text-ink placeholder:text-ash rounded-[10px] border px-3 py-2 text-[16px] outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            본문 <span className="text-danger-500">*</span>
          </span>
          {/* `@` 멘션은 데스크피드에서만 켠다 — 커뮤니티 게시글 멘션은 부결이다(ADR-0038).
              고른 후보를 해석표에 **먼저** 넣어야 뒤이은 재파싱(사진 삭제 → setContent)에서
              "@알 수 없음"으로 바뀌지 않는다. */}
          <PostRichEditor
            ref={richEditorRef}
            initialContent={initial.content}
            imageUrls={imageUrls}
            mentions={mentions}
            enableMention
            onMentionInsert={(candidate) =>
              setMentions((prev) => new Map(prev).set(candidate.userId, candidate.nickname))
            }
            onChange={setContent}
            onSelectImage={registerDroppedImage}
            onSelectedImageChange={setSelectedImageSrc}
          />
          <p className="text-ash text-[13px]">
            사진을 끌어다 놓거나 붙여넣으면 그 자리에 들어가요.
          </p>
          {/* 본문에서 사진을 고르면 그 사진의 제품 태그 패널이 열린다(ADR-0040 결정 5).
              **서버에 등록된 사진일 때만** 열린다 — 방금 떨어뜨려 아직 업로드 중인 사진은
              imageId가 없어 태그를 걸 자리가 없다. */}
          <DeskFeedPhotoProductTagger
            isImageSelected={selectedImage !== undefined}
            productIds={selectedProductIds}
            products={products}
            onChange={applyPhotoProductTags}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            연결할 3D 배치 <span className="text-ash text-[14px] font-normal">(선택)</span>
          </span>
          <p className="text-ash text-[13px]">
            공개한 내 배치만 연결할 수 있어요. 연결하면 상세에 배치 카드가 붙고, 배치 쪽에는 이
            사진이 실사 사진으로 걸립니다.
          </p>
          <select
            value={placementId === null ? '' : String(placementId)}
            onChange={(event) =>
              setPlacementId(event.target.value === '' ? null : Number(event.target.value))
            }
            className="border-ash/40 bg-paper text-ink cursor-pointer rounded-[10px] border px-3 py-2 text-[16px] outline-none"
          >
            <option value="">연결 안 함</option>
            {/* 첨부된 배치가 후보에 없을 수 있다 — 목록 상한(50)을 넘었거나, 공개취소·삭제됐거나,
                후보 조회가 실패했을 때다. 그 경우에도 **선택지를 만들어 준다**: 없으면 select가
                첫 항목("연결 안 함")을 보여주는데 실제로 저장되는 값은 기존 첨부라, 화면이 거짓말을
                한다(사용자는 해제했다고 믿는다). */}
            {placementId !== null && !placements.some((it) => it.id === placementId) && (
              <option value={placementId}>현재 연결된 배치 (#{placementId})</option>
            )}
            {placements.map((placement) => (
              <option key={placement.id} value={placement.id}>
                {placement.title}
              </option>
            ))}
          </select>
          {placementId !== null && !placements.some((it) => it.id === placementId) && (
            <p className="text-ash text-[13px]">
              연결된 배치를 후보 목록에서 찾지 못했어요(공개가 취소됐거나 삭제됐을 수 있어요).
              그대로 두면 연결은 유지되고, 끊으려면 &quot;연결 안 함&quot;을 고르세요.
            </p>
          )}
        </label>

        <DeskFeedProductPicker
          selected={products}
          onChange={setProducts}
          placementId={placementId}
        />

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
          <p className="text-ash text-[13px]">
            {isTagLimitReached
              ? `태그는 최대 ${DESK_FEED_MAX_TAGS}개까지 넣을 수 있어요.`
              : `${tags.length}/${DESK_FEED_MAX_TAGS}`}
          </p>
        </label>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <InlineNotice variant="error" message={errorMessage} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 sm:justify-end">
        <button
          type="button"
          onClick={() => {
            if (!isDirty || confirmDiscardDraft()) router.push(`/desk-feed/${deskFeedId}`);
          }}
          className="border-ash/20 text-ink hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors sm:min-w-[140px] sm:flex-none"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[140px] sm:flex-none"
        >
          {isSubmitting ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </form>
  );
};

export default DeskFeedEditForm;
