'use client';
// 커뮤니티 게시물 상세 — 실제 `GET /posts/{id}`로 글을 받아 제목 + 마크다운 본문을 단일 컬럼으로 그린다.
// 본문의 `[[placement:ID]]` 토큰이 가리키는 배치는 여기서 **한 번에 한 요청**으로 받아
// PostContent에 맵으로 내려준다(카드마다 fetch하면 토큰 개수만큼 왕복이 생긴다 — ADR-0013).
// 좋아요는 `GET/PUT/DELETE /posts/{id}/like`(api/interaction.ts)를 쓰고, 토글 성공 후 GET으로
// 서버 값을 다시 확정한다(카운트를 클라이언트가 계산하면 연타 시 어긋난다 — collection와 같은 규약).
// 댓글은 아직 게시글용 엔드포인트가 없어 이 세션 메모리(communityCommentsStore)에만 남는다.
// **공개 상세는 라우트가 서버에서 받아 `initialDetail`로 내려준다**(D34·ADR-0037 결정 4) — 그래야
// 첫 HTML에 제목·본문이 실려 크롤러가 읽는다(데스크피드와 같은 처방).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BackButton from '@/components/common/BackButton';
import ScrollProgress from '@/components/common/ScrollProgress';
import Toast from '@/components/common/Toast';
import { ApiError } from '@/api/client';
import { detailToCommunityPost, removeCommunityPost } from '@/api/community';
import { deletePostLike, getPostLike, putPostLike } from '@/api/interaction';
import { listPlacements } from '@/api/placement';
import { getPost } from '@/api/post';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/store/authStore';
import { EMPTY_COMMENTS, useCommunityCommentsStore } from '@/store/communityCommentsStore';
import type { PlacementSummaryResponse } from '@/types/placement';
import type { PostDetailResponse } from '@/types/post';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import AuthorAvatar from './AuthorAvatar';
import { extractPlacementIds, nowIsoString } from './communityContent';
import PostContent from './PostContent';
import type { CommunityPost } from './types';

type Props = {
  postId: number;
  /** 라우트가 서버에서 미리 받아 둔 공개 상세(D34·ADR-0037 결정 4 — 데스크피드와 같은 처방).
   *
   *  이게 있으면 첫 렌더에 본문이 이미 들어 있어 SSR HTML을 크롤러가 읽는다. 좋아요 여부·본인 글
   *  판정은 세션에 딸린 값이라 하이드레이션 뒤에 따로 확정한다. */
  initialDetail?: PostDetailResponse;
};

type LoadState = 'loading' | 'ready' | 'error';

const EMPTY_PLACEMENTS: ReadonlyMap<number, PlacementSummaryResponse> = new Map();
const EMPTY_IMAGE_URLS: ReadonlyMap<string, string> = new Map();

const CommunityDetail = ({ postId, initialDetail }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  // 세션의 userId는 문자열, 게시글의 authorId는 숫자다 — 비교는 문자열로 맞춘다.
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );

  const [post, setPost] = useState<CommunityPost | null>(
    initialDetail === undefined ? null : detailToCommunityPost(initialDetail),
  );
  const [loadState, setLoadState] = useState<LoadState>(
    initialDetail === undefined ? 'loading' : 'ready',
  );
  const [placements, setPlacements] =
    useState<ReadonlyMap<number, PlacementSummaryResponse>>(EMPTY_PLACEMENTS);
  // 본문에 저장된 것은 만료 없는 imageKey다 — 렌더 시점에 이 맵으로 presigned URL을 찾는다.
  const [imageUrls, setImageUrls] = useState<ReadonlyMap<string, string>>(() =>
    initialDetail === undefined
      ? EMPTY_IMAGE_URLS
      : new Map(initialDetail.images.map((image) => [image.imageKey, image.imageUrl])),
  );
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialDetail?.likeCount ?? 0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const postKey = String(postId);
  const userComments = useCommunityCommentsStore((s) => s.byPostId[postKey] ?? EMPTY_COMMENTS);
  const addComment = useCommunityCommentsStore((s) => s.addComment);
  const removeComment = useCommunityCommentsStore((s) => s.removeComment);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    // 서버가 이미 준 상세는 다시 받지 않는다 — 같은 공개 응답이라 왕복만 늘어난다.
    if (initialDetail !== undefined) return;
    let cancelled = false;
    // 뷰 모델(CommunityPost)에는 images가 없으므로 원시 상세를 직접 부른다 — 본문 key 해석에 필요하다.
    getPost(postId)
      .then((detail) => {
        if (cancelled) return;
        setPost(detailToCommunityPost(detail));
        setImageUrls(new Map(detail.images.map((image) => [image.imageKey, image.imageUrl])));
        setLikeCount(detail.likeCount);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [postId, initialDetail]);

  // 본문이 참조하는 배치를 요청 한 번으로 받는다 — listPlacements가 ids를 콤마로 묶어 보낸다.
  const content = post?.content ?? '';
  useEffect(() => {
    const ids = extractPlacementIds(content);
    // 토큰이 없으면 아무것도 안 한다 — 이전 글의 맵이 남아 있어도 조회되지 않으니 굳이 비우지 않는다
    // (렌더 중 setState는 react-hooks/set-state-in-effect가 막는다).
    if (ids.length === 0) return;
    let cancelled = false;
    listPlacements({ ids })
      .then((page) => {
        if (cancelled) return;
        setPlacements(new Map(page.content.map((placement) => [placement.id, placement])));
      })
      .catch((error: unknown) => {
        // 실패해도 본문은 그대로 보여준다 — 카드 자리는 "삭제된 배치입니다" 플레이스홀더가 된다.
        console.error('[CommunityDetail] 배치 임베드를 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  // 좋아요 여부는 로그인 상태에서만 조회한다 — 비로그인은 401이라 "안 눌렀다"로 단정할 수 없다.
  useEffect(() => {
    if (myUserId === null) return;
    let cancelled = false;
    getPostLike(postId)
      .then((status) => {
        if (cancelled) return;
        setIsLiked(status.liked);
        setLikeCount(status.likeCount);
      })
      .catch((error: unknown) => {
        console.error('[CommunityDetail] 좋아요 상태를 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, myUserId]);

  const handleToggleLike = async (): Promise<void> => {
    if (!requireAuth()) return;
    const willLike = !isLiked;
    try {
      await (willLike ? putPostLike(postId) : deletePostLike(postId));
      const status = await getPostLike(postId);
      setIsLiked(status.liked);
      setLikeCount(status.likeCount);
      setToastMessage(willLike ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.');
    } catch (error) {
      console.error('[CommunityDetail] 좋아요를 반영하지 못했습니다', error);
      setToastMessage('좋아요를 반영하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!requireAuth()) return;
    if (!window.confirm('이 글을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setIsDeleting(true);
    try {
      await removeCommunityPost(postId);
      router.push('/community');
    } catch (error) {
      console.error('[CommunityDetail] 글 삭제에 실패했습니다', error);
      const status = error instanceof ApiError ? error.status : undefined;
      setToastMessage(
        status === 403 ? '내 글만 삭제할 수 있어요.' : '글을 삭제하지 못했어요. 다시 시도해주세요.',
      );
      setIsDeleting(false);
    }
  };

  const handleSubmitComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const value = commentDraft.trim();
    if (!value) return;
    addComment({
      id: `comment-${crypto.randomUUID()}`,
      postId: postKey,
      author: '나',
      content: value,
      createdAt: nowIsoString(),
    });
    setCommentDraft('');
  };

  const handleDeleteComment = (commentId: string) => {
    if (!requireAuth()) return;
    removeComment(postKey, commentId);
  };

  if (loadState === 'loading') {
    return (
      <div className="bg-paper min-h-full">
        <div className="mx-auto max-w-[720px] px-6 pt-16 pb-24">
          <p className="text-ash text-center text-[15px]">글을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || post === null) {
    return (
      <div className="bg-paper min-h-full">
        <div className="mx-auto max-w-[720px] px-6 pt-8 pb-24">
          <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
            <p className="text-ink text-[18px] font-medium">이 글을 찾을 수 없어요</p>
            <p className="text-ash text-[14px] leading-6">삭제됐거나 주소가 잘못됐을 수 있어요.</p>
            <Link
              href="/community"
              className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
            >
              커뮤니티로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isMyPost = myUserId !== null && post.authorId != null && String(post.authorId) === myUserId;
  const comments = userComments;

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-8 pb-24 lg:px-[48px]">
        <div className="mb-4">
          <BackButton fallbackHref="/community" />
        </div>

        <div className="font-swiss mx-auto max-w-[720px] min-w-0 tracking-[-0.03em]">
          <h1 className="text-ink text-[32px] leading-[1.2] font-medium">{post.title}</h1>

          <div className="mt-4 flex items-center gap-2">
            <AuthorAvatar name={post.author} size={32} />
            <span className="text-ink text-[14px]">{post.author}</span>
            <span className="text-ash text-[14px] tabular-nums">
              {formatRelativeTime(post.createdAt)}
            </span>
            {isMyPost && (
              <span className="ml-auto flex items-center gap-3">
                <Link
                  href={`/community/${post.id}/edit`}
                  className="text-ash hover:text-ink text-[14px]"
                >
                  수정
                </Link>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleDelete()}
                  className="text-ash hover:text-danger-500 cursor-pointer text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? '삭제 중' : '삭제'}
                </button>
              </span>
            )}
          </div>

          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={{ pathname: '/community', query: { tag } }}
                  className="bg-fog text-ink hover:bg-highlight cursor-pointer rounded-full px-3 py-1 text-[14px] transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <div className="border-ash/20 mt-6 border-t pt-6">
            <PostContent content={post.content} placements={placements} imageUrls={imageUrls} />
          </div>

          {/* 좋아요는 글을 다 읽은 자리(본문 끝 ~ 댓글 사이)에 라벨을 달아 크게 둔다 — 제목 옆
              작은 하트에서 옮겨왔다(2026-08-03 사용자 요청). 공용 CountPillToggle의 배경 있는
              분기는 제품 상세 액션 줄 크기에 맞춰져 있고 텍스트 라벨도 못 받아 여기선 안 쓴다. */}
          <div className="border-ash/20 mt-10 flex justify-center border-t pt-8">
            <button
              type="button"
              onClick={() => void handleToggleLike()}
              aria-pressed={isLiked}
              className={`focus-visible:outline-primary-600 flex h-12 cursor-pointer items-center gap-2 rounded-full border px-6 text-[16px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isLiked
                  ? 'border-danger-500/40 bg-danger-50 text-danger-500'
                  : 'border-ash/40 bg-paper text-ink hover:bg-danger-50 hover:text-danger-500'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path
                  d="M8 13.6 6.7 12.4C3.3 9.3 1.4 7.6 1.4 5.5 1.4 3.6 2.9 2 4.9 2c1.1 0 2.2.5 3.1 1.4C8.9 2.5 10 2 11.1 2c2 0 3.5 1.6 3.5 3.5 0 2.1-1.9 3.8-5.3 6.9L8 13.6Z"
                  strokeLinejoin="round"
                />
              </svg>
              좋아요
              <span className="text-[16px]">{likeCount}</span>
            </button>
          </div>
        </div>

        <div className="font-swiss mx-auto mt-12 max-w-[720px] tracking-[-0.03em]">
          <h2 className="text-ink mb-4 text-[20px] font-medium">
            댓글 <span className="text-ash text-[16px] font-normal">{comments.length}개</span>
          </h2>

          <form onSubmit={handleSubmitComment} className="mb-6 flex gap-2">
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="댓글을 남겨보세요"
              rows={2}
              className="border-ash/40 bg-paper text-ink placeholder:text-ash flex-1 resize-none rounded-[10px] border px-3 py-2 text-[14px]"
            />
            <button
              type="submit"
              className="bg-ink text-paper hover:bg-ink/85 flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[14px] font-medium transition-colors"
            >
              등록
            </button>
          </form>

          {comments.length === 0 ? (
            <p className="text-ash text-[14px]">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="border-ash/20 flex items-start gap-2.5 border-t pt-4"
                >
                  <AuthorAvatar name={comment.author} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-ink text-[14px] font-medium">{comment.author}</span>
                      <span className="text-ash text-[12px] tabular-nums">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                      {/* 본인(이 세션에서 내가 단) 댓글만 삭제할 수 있다 */}
                      {comment.author === '나' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
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
          )}
        </div>
      </div>

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
};

export default CommunityDetail;
