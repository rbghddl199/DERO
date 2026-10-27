'use client';
// 컬렉션에 올리기 시트 — 작업실 카드에서 바로 여는 경량 폼이다(D33·ADR-0036 결정 4).
// 제목(배치 이름 프리필·수정 가능) + 설명 + 태그 ≤5를 받아 **배치에 저장하고**(제목·설명)
// **게시 요청**(태그)을 보낸다. `/collection/new` 화면은 이 시트로 대체돼 없어졌다.
//
// **제목·설명의 정본은 `placement.title`·`description`이다** — 종전 localStorage 사이드카
// (`collectionMyPostsStore`)는 "배치에 컬렉션 전용 필드가 없다"는 틀린 전제로 태어나 폐기됐다.
// 저장은 `PUT /placements/{id}`라 상세를 먼저 받아 제목·설명만 갈아 끼운다 — 부분 갱신
// 엔드포인트가 없다. 그 변환은 **수정 전용 `toPlacementUpdateSnapshot`**이다: 저장은 통째 교체가
// 아니라 아이템 id 매칭 병합이라, 리믹스용 변환(id·version이 null)을 쓰면 제목만 고쳐도
// `placed_item` 행이 전부 삭제·재삽입된다.
//
// **순서는 배치 저장 → 게시 요청이다.** 게시(202)가 먼저면 상상도가 옛 제목으로 만들어질 수
// 있고, 저장이 실패했는데 게시만 성공하면 컬렉션에 배치 이름이 그대로 걸린다.
//
// 게시 요청은 202 Accepted다 — "접수됐다"이지 "컬렉션에 떴다"가 아니다(ADR-0015). 그래서 성공하면
// 시트를 닫고 진행은 상단 알림 벨(전역 워처 `common/UploadWatcherBootstrap.tsx`)이 맡는다.
//
// **FAILED 배치의 재게시도 이 시트다** — 실패한 배치를 다시 올리는 것과 처음 올리는 것은 사용자
// 입장에서 같은 행위라 재시도 전용 UI를 따로 만들지 않는다(ADR-0036 결정 4).

import { useEffect, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  getPlacement,
  publishPlacementToFeed,
  toPlacementUpdateSnapshot,
  updatePlacement,
} from '@/api/placement';
import BodyPortal from '@/components/common/BodyPortal';
import ImageQuotaNotice from '@/components/common/ImageQuotaNotice';
import InlineNotice from '@/components/common/InlineNotice';
import { COLLECTION_MAX_TAGS } from '@/constants/collectionPosts';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useAuthStore } from '@/store/authStore';
import { useUploadNotificationsStore } from '@/store/uploadNotificationsStore';
import type { PlacementDetailResponse } from '@/types/placement';
import {
  imageQuotaExceededMessage,
  isImageQuotaExceededError,
  remainingImageQuota,
} from '@/utils/imageQuota';
import { placementPublishErrorMessage } from '@/utils/placementPublishError';

const THUMBNAIL_MISSING_MESSAGE =
  '스크린샷이 없어 올릴 수 없어요. 시뮬레이터에서 이 배치를 한 번 저장해 화면을 남긴 뒤 다시 시도해 주세요.';

type Props = {
  placementId: number;
  /** 제목 프리필용 — 카드가 이미 갖고 있는 이름이라 상세를 기다리지 않고 먼저 채운다. */
  defaultTitle: string;
  /** 이 배치가 이미 한 번 실패한 건인지 — 문구만 바뀐다(동작은 같다). */
  isRetry: boolean;
  onClose: () => void;
  /** 202를 받은 뒤 — 카드가 상태를 PENDING으로 바꾼다. */
  onAccepted: () => void;
};

type DetailState =
  | { status: 'loading' }
  | { status: 'loaded'; detail: PlacementDetailResponse }
  | { status: 'failed' };

const CollectionPublishSheet = ({
  placementId,
  defaultTitle,
  isRetry,
  onClose,
  onAccepted,
}: Props) => {
  const session = useAuthStore((s) => s.auth.session);
  const startWatch = useUploadNotificationsStore((s) => s.startWatch);
  // 게시가 상상도를 만든다 — 남은 장수를 먼저 보여 준다(한도를 못 읽으면 잠그지 않는다, 서버 429가 최종 게이트).
  const { quota, isLoading: isQuotaLoading, refresh: refreshQuota } = useImageQuota();

  const [detailState, setDetailState] = useState<DetailState>({ status: 'loading' });
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent | globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // 상세는 두 가지를 준다: 저장에 쓸 스냅샷 원본과, 스크린샷 유무다(목록의 thumbnailUrl은 key가
  // 결정론적이라 항상 채워져 온다 — 상세만 정직하게 null을 준다).
  useEffect(() => {
    let cancelled = false;
    getPlacement(placementId)
      .then((detail) => {
        if (cancelled) return;
        setDetailState({ status: 'loaded', detail });
        // 이미 올린 적 있는 배치는 그때 쓴 제목·설명이 배치에 남아 있다 — 그걸 프리필한다.
        setTitle(detail.title);
        setDescription(detail.description ?? '');
      })
      .catch(() => {
        // 상세를 못 받으면 저장할 스냅샷이 없다 — 게시만 하는 반쪽 경로를 만들지 않고 막는다.
        if (!cancelled) setDetailState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [placementId]);

  const isThumbnailMissing =
    detailState.status === 'loaded' && detailState.detail.thumbnailUrl === null;
  const isQuotaExhausted = quota !== null && remainingImageQuota(quota) === 0;
  const isTagLimitReached = tags.length >= COLLECTION_MAX_TAGS;

  const titleError = title.trim() === '' ? '제목을 입력해주세요.' : undefined;
  const descriptionError = description.trim() === '' ? '설명을 입력해주세요.' : undefined;
  const visibleTitleError = hasAttemptedSubmit ? titleError : undefined;
  const visibleDescriptionError = hasAttemptedSubmit ? descriptionError : undefined;

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
    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const submit = async (detail: PlacementDetailResponse): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    try {
      // 제목·설명은 배치가 정본이다 — 부분 갱신 엔드포인트가 없어 상세를 스냅샷으로 되돌려 두
      // 필드만 갈아 낀다. **수정 전용 변환(`toPlacementUpdateSnapshot`)을 쓴다** — 리믹스용
      // 변환은 아이템 id와 version을 비워 `placed_item`을 통째로 갈아 치우고 409를 부른다.
      await updatePlacement(placementId, {
        ...toPlacementUpdateSnapshot(detail),
        title: trimmedTitle,
        description: trimmedDescription,
      });
    } catch (error) {
      console.error('[CollectionPublishSheet] 제목·설명을 저장하지 못했습니다', error);
      setSubmitError('제목·설명을 저장하지 못했어요. 다시 시도해주세요.');
      setIsSubmitting(false);
      return;
    }

    try {
      // 202 Accepted — 판정·스크린샷·한도 게이트를 통과해 큐에 들어간 것까지가 이 응답의 뜻이다.
      // 태그는 이 본문에 실려 서버에 남는다(placement_hashtag, DERO-493).
      await publishPlacementToFeed(placementId, tags);
    } catch (error) {
      // 429 `IMAGE_QUOTA_EXCEEDED`만 리셋 시각을 덧붙인다 — 나머지는 서버 문구가 정확하다.
      if (isImageQuotaExceededError(error)) {
        setSubmitError(imageQuotaExceededMessage(quota));
        refreshQuota();
      } else {
        setSubmitError(placementPublishErrorMessage(error));
      }
      setIsSubmitting(false);
      return;
    }

    refreshQuota();
    // 진행 감시는 전역 워처가 한다 — 이 화면을 떠나도 완료 알림이 온다.
    if (session !== null) {
      startWatch({ placementId, title: trimmedTitle, ownerId: session.userId });
    }
    setIsSubmitting(false);
    onAccepted();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting || detailState.status !== 'loaded') return;
    if (titleError !== undefined || descriptionError !== undefined) {
      setHasAttemptedSubmit(true);
      return;
    }
    void submit(detailState.detail);
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        onClick={onClose}
      >
        <form
          onSubmit={handleSubmit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-publish-sheet-title"
          onClick={(event) => event.stopPropagation()}
          className="font-swiss scrollbar-primary bg-paper max-h-[85vh] w-full max-w-[440px] overflow-y-auto rounded-2xl p-5 tracking-[-0.03em] shadow-lg"
        >
          <h2 id="collection-publish-sheet-title" className="text-ink text-[20px] font-medium">
            {isRetry ? '컬렉션에 다시 올리기' : '컬렉션에 올리기'}
          </h2>
          <p className="text-ash mt-1 text-[13px] leading-5">
            올린 배치 사진은 AI 사진으로 바뀌어 잠시 뒤 컬렉션에 공개돼요.
          </p>

          <div className="mt-3 flex justify-end">
            <ImageQuotaNotice quota={quota} isLoading={isQuotaLoading} />
          </div>

          {detailState.status === 'failed' && (
            <div className="mt-3">
              <InlineNotice
                variant="error"
                message="배치를 불러오지 못했어요. 잠시 뒤 다시 시도해주세요."
              />
            </div>
          )}
          {isThumbnailMissing && (
            <div className="mt-3">
              <InlineNotice variant="warning" message={THUMBNAIL_MISSING_MESSAGE} />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-ink text-[15px] font-semibold">
                제목 <span className="text-danger-500">*</span>
              </span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="제목을 입력해주세요"
                aria-invalid={visibleTitleError ? true : undefined}
                className={`bg-paper text-ink placeholder:text-ash rounded-[10px] border px-3 py-2 text-[16px] outline-none ${
                  visibleTitleError ? 'border-danger-500' : 'border-ash/40'
                }`}
              />
              {visibleTitleError && (
                <p role="alert" className="text-danger-700 text-[13px] leading-5">
                  {visibleTitleError}
                </p>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-ink text-[15px] font-semibold">
                설명 <span className="text-danger-500">*</span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="어떤 데스크테리어인지 소개해주세요"
                aria-invalid={visibleDescriptionError ? true : undefined}
                className={`bg-paper text-ink placeholder:text-ash resize-none rounded-[10px] border px-3 py-2 text-[16px] outline-none ${
                  visibleDescriptionError ? 'border-danger-500' : 'border-ash/40'
                }`}
              />
              {visibleDescriptionError && (
                <p role="alert" className="text-danger-700 text-[13px] leading-5">
                  {visibleDescriptionError}
                </p>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-ink text-[15px] font-semibold">
                태그{' '}
                <span className="text-ash text-[13px] font-normal">
                  (최대 {COLLECTION_MAX_TAGS}개)
                </span>
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
                  ? `태그는 최대 ${COLLECTION_MAX_TAGS}개까지 넣을 수 있어요.`
                  : `${tags.length}/${COLLECTION_MAX_TAGS}`}
              </p>
            </label>
          </div>

          {submitError && (
            <div className="mt-4">
              <InlineNotice variant="error" message={submitError} />
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border-ash/20 text-ink hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-medium transition-colors"
            >
              닫기
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                detailState.status !== 'loaded' ||
                isThumbnailMissing ||
                isQuotaExhausted
              }
              title={
                isThumbnailMissing
                  ? THUMBNAIL_MISSING_MESSAGE
                  : isQuotaExhausted
                    ? imageQuotaExceededMessage(quota)
                    : undefined
              }
              className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper flex-1 cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '올리는 중...' : isRetry ? '다시 올리기' : '올리기'}
            </button>
          </div>
        </form>
      </div>
    </BodyPortal>
  );
};

export default CollectionPublishSheet;
