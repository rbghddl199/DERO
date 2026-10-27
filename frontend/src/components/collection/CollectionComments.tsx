'use client';
// 배치 상세의 댓글 영역 — 실제 API(api/comment.ts)로 목록·작성·삭제를 한다. 목록 조회만 비로그인도
// 200이라 로그인 없이도 읽을 수 있고, 작성·삭제는 requireAuth()를 통과해야 한다.
// 커서 페이지네이션은 "더 보기" 버튼으로 이어 받는다(무한 스크롤보다 단순한 쪽을 골랐다).

import { useEffect, useState } from 'react';
import PersonAvatar from '@/components/common/PersonAvatar';
import Toast from '@/components/common/Toast';
import { createComment, deleteComment, getComments } from '@/api/comment';
import { ApiError } from '@/api/client';
import { COMMENT_PAGE_SIZE, INTERACTION_ERROR_CODES } from '@/constants/interaction';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/store/authStore';
import type { CommentResponse } from '@/types/interaction';
import { formatRelativeTime } from '@/utils/formatRelativeTime';

type Props = {
  placementId: number;
};

type ListState = 'loading' | 'ready' | 'error';

const CollectionComments = ({ placementId }: Props) => {
  const requireAuth = useRequireAuth();
  // 세션의 userId는 문자열, 댓글의 userId는 숫자다 — 비교는 문자열로 맞춘다.
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );

  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [listState, setListState] = useState<ListState>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getComments(placementId, { size: COMMENT_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setComments(page.content);
        setNextCursor(page.nextCursor);
        setHasNext(page.hasNext);
        setTotalCount(page.totalCount);
        setListState('ready');
      })
      .catch(() => {
        if (!cancelled) setListState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [placementId]);

  const handleLoadMore = async (): Promise<void> => {
    if (nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await getComments(placementId, {
        cursor: nextCursor,
        size: COMMENT_PAGE_SIZE,
      });
      setComments((prev) => [...prev, ...page.content]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
      setTotalCount(page.totalCount);
    } catch (error) {
      console.error('[CollectionComments] 댓글을 더 불러오지 못했습니다', error);
      setToastMessage('댓글을 더 불러오지 못했어요.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 작성 성공 후 첫 페이지를 다시 받는다 — 백엔드 정렬 방향을 프론트가 추측해 끼워 넣으면
  // 순서가 어긋날 수 있어서다(그 대신 이미 불러온 다음 페이지들은 접힌다).
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!requireAuth()) return;
    const content = draft.trim();
    if (content === '' || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createComment(placementId, content);
      const page = await getComments(placementId, { size: COMMENT_PAGE_SIZE });
      setComments(page.content);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
      setTotalCount(page.totalCount);
      setListState('ready');
      setDraft('');
    } catch (error) {
      console.error('[CollectionComments] 댓글 등록에 실패했습니다', error);
      const code = error instanceof ApiError ? error.problem?.code : undefined;
      setToastMessage(
        code === INTERACTION_ERROR_CODES.placementNotFound
          ? '비공개거나 삭제된 배치예요.'
          : '댓글을 등록하지 못했어요. 다시 시도해주세요.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number): Promise<void> => {
    if (!requireAuth()) return;
    try {
      await deleteComment(placementId, commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('[CollectionComments] 댓글 삭제에 실패했습니다', error);
      const code = error instanceof ApiError ? error.problem?.code : undefined;
      if (code === INTERACTION_ERROR_CODES.commentNotOwned) {
        setToastMessage('내 댓글만 삭제할 수 있어요.');
        return;
      }
      if (code === INTERACTION_ERROR_CODES.commentNotFound) {
        // 이미 지워진 댓글이면 목록에서만 걷어낸다.
        setComments((prev) => prev.filter((comment) => comment.id !== commentId));
        setTotalCount((prev) => Math.max(0, prev - 1));
        return;
      }
      setToastMessage('댓글을 삭제하지 못했어요. 다시 시도해주세요.');
    }
  };

  const isMyComment = (comment: CommentResponse): boolean =>
    myUserId !== null && comment.userId !== null && String(comment.userId) === myUserId;

  return (
    <section className="font-swiss mt-12 tracking-[-0.03em]">
      <h2 className="text-ink mb-4 text-[20px] font-medium">
        댓글 <span className="text-ash text-[16px] font-normal">{totalCount}개</span>
      </h2>

      <form onSubmit={(event) => void handleSubmit(event)} className="mb-6 flex gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="댓글을 남겨보세요"
          rows={2}
          className="border-ash/40 bg-paper text-ink placeholder:text-ash flex-1 resize-none rounded-[10px] border px-3 py-2 text-[14px]"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-ink text-paper hover:bg-ink/85 flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '등록 중' : '등록'}
        </button>
      </form>

      {listState === 'loading' && <p className="text-ash text-[14px]">댓글을 불러오는 중...</p>}
      {listState === 'error' && (
        <p className="text-ash text-[14px]">댓글을 불러올 수 없어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {listState === 'ready' &&
        (comments.length === 0 ? (
          <p className="text-ash text-[14px]">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="border-ash/20 flex items-start gap-2.5 border-t pt-4"
                >
                  <PersonAvatar name={comment.nickname} avatarUrl={null} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-ink text-[14px] font-medium">{comment.nickname}</span>
                      <span className="text-ash text-[12px] tabular-nums">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                      {isMyComment(comment) && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(comment.id)}
                          className="text-ash hover:text-danger-500 ml-auto cursor-pointer text-[12px]"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-ink mt-1 text-[14px] leading-[1.6]">{comment.content}</p>
                  </div>
                </li>
              ))}
            </ul>

            {hasNext && (
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={() => void handleLoadMore()}
                className="border-ash/40 text-ink hover:bg-fog mt-6 w-full cursor-pointer rounded-[10px] border py-3 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMore ? '불러오는 중...' : '댓글 더 보기'}
              </button>
            )}
          </>
        ))}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </section>
  );
};

export default CollectionComments;
