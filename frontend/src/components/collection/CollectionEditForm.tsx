'use client';
// 컬렉션 글 수정 — 제목·설명·태그만 고친다. 배치(desk·아이템) 자체는 여기서 못 바꾼다 —
// 그건 시뮬레이터에서 다시 저장해야 하는 별개 작업이다.
//
// **저장이 두 호출이다**: 태그는 `PUT /placements/{id}/feed-entry/tags`, 제목·설명은
// `PUT /placements/{id}`(스냅샷 전체 교체 — 부분 갱신 엔드포인트가 없다)다. 제목·설명의 정본이
// `placement.title`·`description`으로 통일되면서 로컬 사이드카는 폐기됐다(D33·ADR-0036 결정 4).
// **태그가 먼저다** — 실패하면 화면에 남아 다시 시도할 수 있어야 하고, 제목만 먼저 저장되면
// "저장했는데 태그만 옛날 값"이 되고 사용자는 그 사실을 모른다.
//
// **공개 전환 PUT을 재사용하지 않는다** — 그 호출은 재시도 버튼이라 PUBLIC 배치를 PENDING으로
// 되돌리고 AI 상상도를 다시 만들어 일일 한도까지 깎는다(api-spec.md §4).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { getCollectionPost } from '@/api/collection';
import {
  getPlacement,
  replacePlacementTags,
  toPlacementUpdateSnapshot,
  updatePlacement,
} from '@/api/placement';
import { COLLECTION_MAX_TAGS } from '@/constants/collectionPosts';
import { confirmDiscardDraft, useUnsavedDraftGuard } from '@/hooks/useUnsavedDraftGuard';
import { useAuthStore } from '@/store/authStore';
import type { CollectionPost } from './types';

type LoadState = 'loading' | 'ready' | 'error';

type FieldErrors = {
  title?: string;
  description?: string;
};

const FieldError = ({ message }: { message: string }) => (
  <p role="alert" className="text-danger-700 text-[13px] leading-5">
    {message}
  </p>
);

type Props = {
  collectionId: string;
};

const CollectionEditForm = ({ collectionId }: Props) => {
  const router = useRouter();
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [post, setPost] = useState<CollectionPost | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCollectionPost(collectionId)
      .then((found) => {
        if (cancelled) return;
        if (found === undefined) {
          setLoadState('error');
          return;
        }
        setPost(found);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  // 폼을 채우는 건 한 번만 — 사용자가 입력을 시작한 뒤 이 이펙트가 다시 돌아 타이핑을 덮어쓰면
  // 안 된다. setTimeout으로 감싸는 이유: 이펙트 본문에서 곧장 setState하면 React Compiler
  // 린트(react-hooks/set-state-in-effect)가 막는다(AutoCarousel과 같은 우회).
  useEffect(() => {
    if (hasPrefilled || post === null) return;
    const timer = setTimeout(() => {
      setTitle(post.title);
      setDescription(post.description);
      setTags(post.tags);
      setHasPrefilled(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [hasPrefilled, post]);

  const hasChanges =
    hasPrefilled &&
    post !== null &&
    (title !== post.title ||
      description !== post.description ||
      JSON.stringify(tags) !== JSON.stringify(post.tags) ||
      tagInput.trim() !== '');
  useUnsavedDraftGuard(hasChanges && !isSaving);

  const isTagLimitReached = tags.length >= COLLECTION_MAX_TAGS;

  const addTag = () => {
    const next = tagInput.trim();
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

  const errors: FieldErrors = {
    title: title.trim() === '' ? '제목을 입력해주세요.' : undefined,
    description: description.trim() === '' ? '작성자 설명을 입력해주세요.' : undefined,
  };
  const isValid = errors.title === undefined && errors.description === undefined;
  const visibleErrors: FieldErrors = hasAttemptedSubmit ? errors : {};

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    const placementId = Number(collectionId);
    // 태그가 먼저다 — 파일 상단 주석 참고.
    try {
      await replacePlacementTags(placementId, tags);
    } catch (error) {
      console.error('[CollectionEditForm] 태그를 저장하지 못했습니다', error);
      setSaveError('태그를 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
      setIsSaving(false);
      return;
    }

    // 제목·설명은 배치가 정본이다. 부분 갱신 엔드포인트가 없어 상세를 **수정 전용 스냅샷**으로
    // 되돌려 두 필드만 갈아 낀다(리믹스용 변환은 아이템 id·version을 비워 행을 갈아 치운다).
    // **공개 전환 PUT(feed-entry)은 여기서 쓰지 않는다** — 그 호출은 PUBLIC 배치를 PENDING으로
    // 되돌리고 상상도를 다시 만들어 일일 한도까지 깎는다.
    try {
      const detail = await getPlacement(placementId);
      await updatePlacement(placementId, {
        ...toPlacementUpdateSnapshot(detail),
        title: title.trim(),
        description: description.trim(),
      });
    } catch (error) {
      console.error('[CollectionEditForm] 제목·설명을 저장하지 못했습니다', error);
      setSaveError('제목·설명을 저장하지 못했어요. 태그는 이미 저장됐어요.');
      setIsSaving(false);
      return;
    }

    router.push(`/collection/${collectionId}`);
  };

  if (loadState === 'loading') {
    return <p className="text-ash py-16 text-center text-[15px]">불러오는 중...</p>;
  }

  if (loadState === 'error' || post === null) {
    return (
      <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
        <p className="text-ink text-[18px] font-medium">이 글을 찾을 수 없어요</p>
        <Link
          href="/collection"
          className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
        >
          컬렉션로 돌아가기
        </Link>
      </div>
    );
  }

  // 서버도 어차피 남의 배치를 못 지우지만(403), 로컬 폼 자체를 남의 글에 띄워두는 건 나쁜 UX다
  // (CommunityPostEditForm과 같은 이유).
  const isMyPost = myUserId !== null && post.authorId != null && String(post.authorId) === myUserId;
  if (!isMyPost) {
    return (
      <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
        <p className="text-ink text-[18px] font-medium">내 글만 수정할 수 있어요</p>
        <Link
          href={`/collection/${collectionId}`}
          className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
        >
          글로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="font-swiss mx-auto max-w-[720px] tracking-[-0.03em]">
      <h1 className="text-ink mb-6 text-[32px] leading-[1.2] font-medium">컬렉션 수정하기</h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">제목</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={visibleErrors.title ? true : undefined}
            className={`bg-paper text-ink rounded-[10px] border px-3 py-2 text-[16px] outline-none ${
              visibleErrors.title ? 'border-danger-500' : 'border-ash/40'
            }`}
          />
          {visibleErrors.title && <FieldError message={visibleErrors.title} />}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">작성자 설명</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={10}
            aria-invalid={visibleErrors.description ? true : undefined}
            className={`bg-paper text-ink resize-none rounded-[10px] border px-3 py-2 text-[14px] outline-none ${
              visibleErrors.description ? 'border-danger-500' : 'border-ash/40'
            }`}
          />
          {visibleErrors.description && <FieldError message={visibleErrors.description} />}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[18px] font-semibold">
            태그{' '}
            <span className="text-ash text-[14px] font-normal">
              (최대 {COLLECTION_MAX_TAGS}개 선택)
            </span>
          </span>
          <div className="border-ash/40 flex flex-wrap items-center gap-2 rounded-[10px] border px-4 py-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="border-ash/40 bg-paper text-ink flex items-center gap-1 rounded-full border px-3 py-1 text-[14px]"
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
              className="text-ink placeholder:text-ash min-w-[140px] flex-1 py-0.5 text-[15px] outline-none disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-ash text-[13px]">
            {isTagLimitReached
              ? `태그는 최대 ${COLLECTION_MAX_TAGS}개까지 넣을 수 있어요.`
              : `${tags.length}/${COLLECTION_MAX_TAGS}`}
          </p>
        </div>
      </div>

      {saveError !== null && (
        <p role="alert" className="text-danger-700 mt-4 text-[14px] leading-5">
          {saveError}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            if (!hasChanges || confirmDiscardDraft()) router.push(`/collection/${collectionId}`);
          }}
          className="border-ash/20 text-ink hover:bg-ink hover:text-paper min-w-[120px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper min-w-[120px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-center text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </form>
  );
};

export default CollectionEditForm;
