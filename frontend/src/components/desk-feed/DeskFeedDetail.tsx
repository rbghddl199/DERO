'use client';
// 데스크피드 상세 — **post 상세와 동형인 마크다운 아티클이다**(D34·ADR-0037): 제목 헤더 +
// 본문(`PostContent`)이고 사진은 본문 안 인라인 이미지로 나온다.
//
// **본문 이미지의 src는 URL이 아니라 imageKey다** — URL 조립 규칙이 바뀌어도 본문이 안 깨지도록
// key만 저장한다. 그래서 `images`가 주는 (imageKey → imageUrl) 맵을 렌더 시점에
// 넘겨 해석한다(CommunityDetail과 같은 처방). 목록 응답에는 그 맵이 없다 — 카드는 coverUrl만 쓴다.
//
// **공개 상세는 라우트가 서버에서 받아 `initialDetail`로 내려준다**(D34·ADR-0037 결정 4) — 그래야
// 첫 HTML에 제목·본문이 실려 크롤러가 읽는다. 세션에 딸린 값(좋아요 여부·본인 글 판정)만 하이드레이션
// 뒤에 확정한다(ADR-0005). 좋아요는 토글(멱등 204) 성공 후 GET으로 서버 값을 다시 확정한다.
//
// **댓글은 실영속이다**(마커 시절 세션 메모리 목의 처방, ADR-0033 결함 4) — 작성·삭제 뒤에는
// 첫 페이지를 다시 받는다. 카운트를 클라이언트가 세면 서버 값과 갈라진다.
//
// 첨부 배치는 **요약 카드**로만 그린다(결정 4 — 3D 뷰어 임베드 부결). 배치가 공개취소·삭제되면
// 서버가 placement를 null로 답하고 카드는 사라진다(결정 5).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import {
  createDeskFeedComment,
  deleteDeskFeed,
  deleteDeskFeedComment,
  deleteDeskFeedLike,
  getDeskFeed,
  getDeskFeedLike,
  listDeskFeedComments,
  putDeskFeedLike,
} from '@/api/deskFeed';
import MentionSuggestionList from '@/components/community/MentionSuggestionList';
import MentionText from '@/components/community/MentionText';
import PostContent from '@/components/community/PostContent';
import {
  buildMentionToken,
  resolveMentions,
  userProfileHref,
} from '@/components/community/communityContent';
import BackButton from '@/components/common/BackButton';
import PersonAvatar from '@/components/common/PersonAvatar';
import ScrollProgress from '@/components/common/ScrollProgress';
import Toast from '@/components/common/Toast';
import DeskFeedActionRail from '@/components/desk-feed/DeskFeedActionRail';
import DeskFeedProductRail from '@/components/desk-feed/DeskFeedProductRail';
import { useMentionAutocomplete } from '@/hooks/useMentionAutocomplete';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/store/authStore';
import { useDeskFeedNavStore } from '@/store/deskFeedNavStore';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import { pickRailAnchor } from '@/utils/deskFeedRailAnchor';
import { findMentionTrigger, type MentionTrigger } from '@/utils/mentionQuery';
import type { DeskFeedCommentResponse, DeskFeedDetailResponse } from '@/types/deskFeed';
import type { UserSearchResultResponse } from '@/types/user';

type Props = {
  deskFeedId: number;
  /** 라우트가 서버에서 미리 받아 둔 공개 상세(D34·ADR-0037 결정 4).
   *
   *  이게 있으면 **첫 렌더에 본문이 이미 들어 있다** — 그래서 SSR HTML에 제목·본문 텍스트가 실려
   *  크롤러가 읽는다. 없으면(서버 조회 실패) 종전대로 클라이언트가 받아 온다. 좋아요 여부·본인 글
   *  판정은 여전히 세션에 딸린 값이라 하이드레이션 뒤 따로 확정한다. */
  initialDetail?: DeskFeedDetailResponse;
};

type LoadState = 'loading' | 'ready' | 'error';

/** 액션 레일의 댓글 버튼이 점프하는 자리 — 앵커를 다는 쪽과 거는 쪽이 같은 값을 봐야 한다. */
const COMMENTS_ANCHOR_ID = 'desk-feed-comments';

const DeskFeedDetail = ({ deskFeedId, initialDetail }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  // 세션의 userId는 문자열, 글의 authorId는 숫자다 — 비교는 문자열로 맞춘다.
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );

  const [post, setPost] = useState<DeskFeedDetailResponse | null>(initialDetail ?? null);
  const [loadState, setLoadState] = useState<LoadState>(
    initialDetail === undefined ? 'loading' : 'ready',
  );
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialDetail?.likeCount ?? 0);
  const [isDeleting, setIsDeleting] = useState(false);
  // 토스트에 seq를 같이 든다 — **같은 문구를 연달아 띄우면** 상태가 그대로라 React가 갱신을
  // 접고, Toast가 remount되지 않아 타이머가 첫 마감에 그대로 사라진다(레일의 "링크를 복사했어요"가
  // 두 번째 클릭에서 아무 일도 안 한 것처럼 보인다).
  const [toast, setToast] = useState<{ message: string; seq: number } | null>(null);
  const setToastMessage = (message: string | null): void =>
    setToast(message === null ? null : (current) => ({ message, seq: (current?.seq ?? 0) + 1 }));

  const [comments, setComments] = useState<DeskFeedCommentResponse[]>([]);
  // 댓글 개수 정본은 목록 응답의 totalCount지만, 그게 오기 전(그리고 실패했을 때)에는 상세가
  // 답한 값이 정직하다 — 0으로 시작하면 화면 위 레일이 "댓글 0"을 먼저 보여 준다.
  const [commentTotal, setCommentTotal] = useState(initialDetail?.commentCount ?? 0);
  /** 다음 댓글 페이지 커서 — null이면 더 없다. */
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // 댓글 입력의 `@` 자동완성. 트리거 감지·토큰 삽입은 입력기(여기선 textarea)가 소유하고,
  // 서버 왕복과 선택 커서만 훅이 맡는다(본문 에디터도 같은 훅을 쓴다).
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null);
  const { candidates, activeIndex, moveActive, isUnavailable } = useMentionAutocomplete(
    mentionTrigger === null ? null : mentionTrigger.query,
  );
  const isSuggestionOpen = mentionTrigger !== null && (candidates.length > 0 || isUnavailable);

  // 이전/다음 글 — 갤러리가 남긴 순서(deskFeedNavStore)에서 이웃을 찾는다. 직접 URL 진입이나
  // 새로고침이면 순서를 모르므로(빈 배열) 내비게이션을 그리지 않는다.
  const postKey = String(deskFeedId);
  const navEntries = useDeskFeedNavStore((s) => s.entries);
  const navIndex = navEntries.findIndex((entry) => entry.id === postKey);
  const prevEntry = navIndex > 0 ? navEntries[navIndex - 1] : null;
  const nextEntry =
    navIndex >= 0 && navIndex < navEntries.length - 1 ? navEntries[navIndex + 1] : null;

  // 사진별 제품 태그(ADR-0040) — 서버가 `images[].productIds`로 답한다. 지금 화면에 있는 사진이
  // 무엇인지 관찰해 좌측 레일 내용을 갈아끼우고, **그 사진 왼쪽 상단에 레일을 세운다**.
  // 사진별 태그가 하나도 없는 글은 앵커가 없어 천장(제목 줄 아래)에 붙은 채 글 전체 목록을 그린다.
  const bodyRef = useRef<HTMLDivElement>(null);
  /** 레일의 sticky 구간 박스 — **사진이 바뀔 때만** top·height를 쓴다(스크롤 중 쓰기는 0). */
  const railRef = useRef<HTMLDivElement>(null);
  /** 그 안에서 붙어 다니는 카드 블록 — 구간 길이에 이 높이를 더해야 사진 끝까지 천장에 머문다. */
  const railContentRef = useRef<HTMLDivElement>(null);
  /** 마지막으로 써 넣은 구간 — 값이 같으면 DOM에 안 쓴다(쓰면 레이아웃이 돌아 스크롤이 끊긴다). */
  const railBoxRef = useRef<{ top: number; height: number } | null>(null);
  /** 지금 레일이 붙어 있는 사진 — 히스테리시스(뜨는 임계 ≠ 사라지는 임계)를 판정하는 값이다. */
  const shownKeyRef = useRef<string | null>(null);
  const [visibleImageSrc, setVisibleImageSrc] = useState<string | null>(null);
  const bodyContent = resolveMentions(post?.content ?? '', post?.mentions);
  // 태그 없는 사진도 맵에 남긴다 — "태그 없는 사진"(레일 숨김)과 "사진 아닌 구간"(직전 유지)을
  // 구분해야 한다(ADR-0040 결정 5 개정).
  const productIdsByImageSrc = new Map(
    (post?.images ?? []).map((image) => [image.imageKey, image.productIds]),
  );
  const hasPhotoTags = (post?.images ?? []).some((image) => image.productIds.length > 0);

  useEffect(() => {
    const root = bodyRef.current;
    if (root === null) return;

    // 레일이 언마운트(태그 없는 사진)됐다 다시 붙으면 인라인 구간이 비어 있다 — 마지막 값을 들고
    // 있으면 "같으니 안 쓴다"로 빠져 레일이 opacity 0인 채 남는다.
    railBoxRef.current = null;

    let raf = 0;
    // 스크롤 중에는 **읽기만** 한다 — 프레임마다 style을 쓰면 그 값이 레이아웃을 돌리고, 다음 프레임의
    // rect 읽기가 강제 리플로우가 되어 스크롤이 툭툭 끊긴다(DERO-630). 붙어 다니는 움직임은
    // `position: sticky`(컴포지터)가 하고, 여기는 사진이 갈릴 때만 구간을 옮긴다.
    const update = () => {
      raf = 0;

      // 사진별 태그가 없는 글의 레일은 글 전체 목록이라 매달 사진이 없다 — 본문 처음부터 끝까지가
      // 구간이고(=`inset-y-0` 그대로) sticky가 천장에 붙여 준다.
      if (!hasPhotoTags) {
        const listRail = railRef.current;
        if (listRail === null) return;
        // 구간을 컨테이너 전체로 늘려야 sticky가 붙는다 — 구간이 카드 높이뿐이면 붙을 여지가 없다.
        listRail.style.height = '100%';
        listRail.style.opacity = '1';
        return;
      }

      // **레일이 붙어 있는지는 판정 뒤에 본다** — 첫 렌더에는 보는 사진이 정해지지 않아 태그 목록이
      // 비고, 그래서 레일이 언마운트 상태다. 여기서 먼저 빠져나가면 판정이 영원히 안 돌아 레일이
      // 끝까지 안 뜬다(DERO-631 회귀 — 629에서는 판정이 먼저였다).
      // 마커는 스크롤마다 새로 찾는다 — IntersectionObserver로 마운트 때 잡아 둔 노드는
      // `PostContent`가 렌더마다 img 렌더러를 새로 만들어(컴포넌트 타입이 갈려 서브트리
      // 리마운트) 죽은 노드가 되고, 옵저버가 다시는 발화하지 않았다(DERO-628).
      const photos = [...root.querySelectorAll<HTMLElement>('[data-image-key]')].flatMap(
        (marker) => {
          const key = marker.dataset.imageKey;
          if (key === undefined) return [];
          const rect = marker.getBoundingClientRect();
          return [{ key, top: rect.top, bottom: rect.bottom, height: rect.height }];
        },
      );
      const anchor = pickRailAnchor(photos, {
        viewportHeight: window.innerHeight,
        shownKey: shownKeyRef.current,
      });
      // null이면 **직전 사진에 그대로 매달아 둔다** — 그 사진은 이미 화면 밖이라 sticky가 밀어냈고,
      // 구간을 건드리면 안 보이는 것을 옮기느라 레이아웃만 돈다.
      if (anchor === null) return;
      if (anchor.key !== shownKeyRef.current) {
        shownKeyRef.current = anchor.key;
        setVisibleImageSrc(anchor.key);
      }

      // 방금 고른 사진에 태그가 없으면 레일이 없다 — 다음 프레임(또는 리마운트 직후 effect)에 잰다.
      const rail = railRef.current;
      if (rail === null) return;

      // 구간은 컨테이너 기준이다 — 스크롤해도 안 바뀌는 값이라 프레임마다 같은 값이 나온다.
      const wrapperTop = rail.parentElement?.getBoundingClientRect().top ?? 0;
      const top = Math.round(anchor.top - wrapperTop);
      // 카드 블록 높이를 더해 둔다 — sticky는 구간 밖으로 못 나가므로, 더하지 않으면 사진 하단이
      // 천장에 닿기 **전에** 레일이 먼저 밀려 나간다(구간이 카드보다 짧으면 아예 안 붙는다).
      const height = Math.round(anchor.height + (railContentRef.current?.offsetHeight ?? 0));
      const box = railBoxRef.current;
      if (box !== null && box.top === top && box.height === height) return;
      railBoxRef.current = { top, height };
      rail.style.top = `${top}px`;
      rail.style.height = `${height}px`;
      rail.style.opacity = '1';
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // `visibleImageSrc`가 deps에 있는 것은 **태그 없는 사진에서 레일이 통째로 언마운트되기** 때문이다 —
    // 다시 마운트된 프레임에 인라인 위치가 비어 있으므로 갈릴 때마다 한 번 더 재야 한다.
  }, [hasPhotoTags, bodyContent, visibleImageSrc]);

  useEffect(() => {
    // 서버가 이미 준 상세는 다시 받지 않는다 — 같은 공개 응답이라 왕복만 늘어난다.
    if (initialDetail !== undefined) return;
    let cancelled = false;
    getDeskFeed(deskFeedId)
      .then((detail) => {
        if (cancelled) return;
        setPost(detail);
        setLikeCount(detail.likeCount);
        // 댓글 목록 조회가 실패해도 개수는 0이 아니라 상세가 답한 값이 정직하다.
        setCommentTotal(detail.commentCount);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [deskFeedId, initialDetail]);

  // 좋아요 여부는 로그인 상태에서만 조회한다 — 비로그인은 401이라 "안 눌렀다"로 단정할 수 없다.
  useEffect(() => {
    if (myUserId === null) return;
    let cancelled = false;
    getDeskFeedLike(deskFeedId)
      .then((status) => {
        if (cancelled) return;
        setIsLiked(status.liked);
        setLikeCount(status.likeCount);
      })
      .catch((error: unknown) => {
        console.error('[DeskFeedDetail] 좋아요 상태를 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [deskFeedId, myUserId]);

  // 댓글 첫 페이지 — 작성·삭제 뒤에도 이 함수로 다시 받는다(카운트 정본은 서버다).
  // **totalCount는 첫 페이지에만 실린다**(서버가 이후 페이지에서 0으로 답한다) — 이어 붙일 때
  // 덮어쓰면 개수가 0으로 튄다.
  const reloadComments = useCallback(
    (): Promise<void> =>
      listDeskFeedComments(deskFeedId).then((page) => {
        setComments(page.content);
        setCommentTotal(page.totalCount);
        setCommentCursor(page.hasNext ? page.nextCursor : null);
      }),
    [deskFeedId],
  );

  useEffect(() => {
    let cancelled = false;
    listDeskFeedComments(deskFeedId)
      .then((page) => {
        if (cancelled) return;
        setComments(page.content);
        setCommentTotal(page.totalCount);
        setCommentCursor(page.hasNext ? page.nextCursor : null);
      })
      .catch((error: unknown) => {
        console.error('[DeskFeedDetail] 댓글을 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [deskFeedId]);

  // 다음 페이지 — 무한 스크롤을 걸지 않는 건 댓글이 페이지 맨 아래라서다(사진 스크롤과 감시점이
  // 겹친다). 버튼이 없으면 20개 넘는 댓글이 조용히 잘린다.
  const loadMoreComments = (): void => {
    // 연타 가드가 없으면 두 요청이 같은 커서를 읽어 같은 댓글이 두 번 붙는다(React key도 중복).
    if (commentCursor === null || isLoadingComments) return;
    setIsLoadingComments(true);
    listDeskFeedComments(deskFeedId, commentCursor)
      .then((page) => {
        setComments((current) => [...current, ...page.content]);
        setCommentCursor(page.hasNext ? page.nextCursor : null);
      })
      .catch((error: unknown) => {
        console.error('[DeskFeedDetail] 댓글을 더 불러오지 못했습니다', error);
      })
      .finally(() => setIsLoadingComments(false));
  };

  const handleToggleLike = async (): Promise<void> => {
    if (!requireAuth()) return;
    const willLike = !isLiked;
    try {
      await (willLike ? putDeskFeedLike(deskFeedId) : deleteDeskFeedLike(deskFeedId));
      const status = await getDeskFeedLike(deskFeedId);
      setIsLiked(status.liked);
      setLikeCount(status.likeCount);
    } catch (error) {
      console.error('[DeskFeedDetail] 좋아요를 반영하지 못했습니다', error);
      setToastMessage('좋아요를 반영하지 못했어요. 다시 시도해주세요.');
    }
  };

  /**
   * 커서 앞 글자만 본다 — 문장 뒤쪽에 남은 `@`가 자동완성을 열지 않게.
   *
   * <b>입력만이 아니라 커서 이동에서도 다시 판정해야 한다</b>(`onSelect`) — 방향키·클릭은
   * `change`를 안 태우고 blur도 아니라, 목록이 옛 `start`를 든 채 열려 있게 된다. 그 상태로
   * Enter를 누르면 엉뚱한 자리에 토큰이 박히고 앞 글자가 중복된다.
   */
  const syncMentionTrigger = (input: HTMLTextAreaElement): void => {
    const caret = input.selectionStart ?? input.value.length;
    // 선택 영역이 있으면 고르는 중이 아니라 지우려는 중이다.
    const collapsed = input.selectionEnd === null || input.selectionEnd === caret;
    setMentionTrigger(collapsed ? findMentionTrigger(input.value.slice(0, caret)) : null);
  };

  const handleCommentChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setCommentDraft(event.target.value);
    syncMentionTrigger(event.target);
  };

  /** `@질의`를 통째로 안정 userId 토큰으로 바꾼다 — 저장되는 것은 닉네임이 아니라 id다. */
  const insertMention = (candidate: UserSearchResultResponse): void => {
    if (mentionTrigger === null) return;
    const input = commentInputRef.current;
    const cursor = input?.selectionStart ?? commentDraft.length;
    const token = `${buildMentionToken(candidate.userId)} `;
    const caret = mentionTrigger.start + token.length;
    setCommentDraft(
      commentDraft.slice(0, mentionTrigger.start) + token + commentDraft.slice(cursor),
    );
    setMentionTrigger(null);
    // 상태 반영 뒤에 커서를 옮긴다 — 지금 옮기면 리렌더가 값을 되돌려 커서가 끝으로 튄다.
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };

  const handleCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 한글 조합 중의 Enter는 조합 확정이라 가로채면 글자가 사라진다(태그 입력과 같은 가드).
    if (!isSuggestionOpen || event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMentionTrigger(null);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const picked = candidates[activeIndex];
      if (picked === undefined) return;
      event.preventDefault();
      insertMention(picked);
    }
  };

  const handleSubmitComment = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!requireAuth()) return;
    const value = commentDraft.trim();
    if (value === '' || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      await createDeskFeedComment(deskFeedId, value);
      setCommentDraft('');
      await reloadComments();
    } catch (error) {
      console.error('[DeskFeedDetail] 댓글을 남기지 못했습니다', error);
      setToastMessage('댓글을 남기지 못했어요. 다시 시도해주세요.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number): Promise<void> => {
    if (!requireAuth()) return;
    try {
      await deleteDeskFeedComment(deskFeedId, commentId);
      await reloadComments();
    } catch (error) {
      console.error('[DeskFeedDetail] 댓글을 삭제하지 못했습니다', error);
      setToastMessage('댓글을 삭제하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!requireAuth()) return;
    if (!window.confirm('이 사진을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setIsDeleting(true);
    try {
      await deleteDeskFeed(deskFeedId);
      router.push('/desk-feed');
    } catch (error) {
      console.error('[DeskFeedDetail] 삭제에 실패했습니다', error);
      const status = error instanceof ApiError ? error.status : undefined;
      setToastMessage(
        status === 403
          ? '내 사진만 삭제할 수 있어요.'
          : '사진을 삭제하지 못했어요. 다시 시도해주세요.',
      );
      setIsDeleting(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <div className="mx-auto max-w-[720px] px-6 pt-16 pb-24">
        <p className="text-ash text-center text-[15px]">사진을 불러오는 중...</p>
      </div>
    );
  }

  if (loadState === 'error' || post === null) {
    return (
      <div className="mx-auto max-w-[720px] px-6 pt-8 pb-24">
        <div className="border-ash/40 flex flex-col items-center gap-3 rounded-2xl border border-dashed py-20 text-center">
          <p className="text-ink text-[18px] font-medium">이 사진을 찾을 수 없어요</p>
          <p className="text-ash text-[14px] leading-6">삭제됐거나 주소가 잘못됐을 수 있어요.</p>
          <Link
            href="/desk-feed"
            className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
          >
            데스크피드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const isMyPost =
    myUserId !== null && post.authorId !== null && String(post.authorId) === myUserId;
  // 본문에 저장된 것은 key다 — 렌더 시점에 이 맵으로 공개 URL을 찾는다.
  const imageUrls = new Map(post.images.map((image) => [image.imageKey, image.imageUrl]));

  // 레일에 세울 제품 — 보는 중인 사진의 태그만 세운다(ADR-0040 결정 5 개정: 글 전체 목록 폴백은
  // 다른 사진의 태그가 그 사진 것처럼 보여 폐기). 태그 없는 사진은 빈 배열이라 레일이 숨고,
  // 사진별 태그가 하나도 없는 글만 글 전체 목록을 세운다. 목록에 없는 id는 그리지 않는다 —
  // 소프트 삭제 제품을 서버가 이미 빼 줬으므로 폴백 조건이 하나다(결정 2).
  const visibleProductIds =
    visibleImageSrc === null ? undefined : productIdsByImageSrc.get(visibleImageSrc);
  const taggedProducts = (visibleProductIds ?? [])
    .map((id) => post.usedProducts.find((product) => product.id === id))
    .filter((product) => product !== undefined);
  const railProducts = hasPhotoTags ? taggedProducts : post.usedProducts;

  return (
    <div className="relative mx-auto max-w-[1200px] px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-[48px]">
      <ScrollProgress />
      <div className="mb-4">
        <BackButton fallbackHref="/desk-feed" />
      </div>

      <div className="font-swiss mx-auto max-w-[720px] min-w-0 tracking-[-0.03em]">
        <h1 className="text-ink mb-4 text-[26px] leading-[1.25] font-medium sm:text-[32px]">
          {post.title}
        </h1>

        <div className="flex items-center gap-2">
          <PersonAvatar name={post.nickname} avatarUrl={null} size={32} />
          {/* 작성자 닉네임도 프로필로 간다 — 멘션과 같은 목적지다(ADR-0038 결정 5).
              탈퇴하면 authorId가 null이라 링크 없이 폴백 문구만 남는다. */}
          {post.authorId === null ? (
            <span className="text-ink text-[14px]">{post.nickname}</span>
          ) : (
            <Link
              href={userProfileHref(post.authorId)}
              className="text-ink text-[14px] hover:underline"
            >
              {post.nickname}
            </Link>
          )}
          <span className="text-ash text-[14px] tabular-nums">
            {formatRelativeTime(post.createdAt)}
          </span>
          {isMyPost && (
            <div className="ml-auto flex items-center gap-3">
              <Link
                href={`/desk-feed/${post.id}/edit`}
                className="text-ash hover:text-ink cursor-pointer text-[14px]"
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
            </div>
          )}
        </div>

        {/* 본문 — 사진이 이 안에 인라인으로 산다. 렌더러는 커뮤니티와 같은 것을 쓴다(post 동형).
            멘션 토큰은 넘기기 전에 마크다운 링크로 치환한다 — 문장 중간에 박히는 인라인이라
            배치 임베드처럼 조각내 컴포넌트로 끼울 수 없다(D35·ADR-0038). */}
        <div className="mt-6" ref={bodyRef}>
          <PostContent content={bodyContent} imageUrls={imageUrls} />
        </div>

        {post.hashtags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {/* 마커가 사라져 hashtag 파라미터가 비었다 — 칩을 누르면 갤러리가 그 태그로 필터된다. */}
            {post.hashtags.map((tag) => (
              <Link
                key={tag}
                href={`/desk-feed?tag=${encodeURIComponent(tag)}`}
                className="bg-fog text-ink hover:bg-ink hover:text-paper rounded-full px-3 py-1 text-[14px] transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* 사용된 제품 — 링크는 **내부** `/product/{id}`다(쿠팡류 외부 링크가 아니다). 소프트 삭제된
            제품은 서버가 아예 안 싣고, 빈 배열이면 섹션 자체를 숨긴다(ADR-0034 결정 5). */}
        {post.usedProducts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-ink mb-3 text-[20px] font-medium">이 책상에 쓰인 제품</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {post.usedProducts.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/product/${product.id}`}
                    className="focus-visible:outline-primary-600 border-ash/30 hover:border-ink block overflow-hidden rounded-2xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {product.imageUrl !== null ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 사용자 사진이라 plain img를 쓴다(next/image 전환은 별건)
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="bg-fog aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="bg-fog aspect-square w-full" />
                    )}
                    <div className="p-3">
                      <p className="text-ink truncate text-[14px] font-medium">{product.name}</p>
                      {/* 자작 제품에는 가격이 없다(D20) — 0원으로 꾸미지 않는다. */}
                      <p className="text-ash mt-0.5 text-[13px] tabular-nums">
                        {product.priceKrw !== null
                          ? `${product.priceKrw.toLocaleString('ko-KR')}원`
                          : '가격 미정'}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 첨부 배치 요약 카드 — 클릭하면 컬렉션 상세로 간다(3D 뷰어 임베드 부결). */}
        {post.placement !== null && (
          <Link
            href={`/collection/${post.placement.id}`}
            className="border-ash/30 hover:border-ink mt-8 flex items-center gap-4 rounded-2xl border p-4 transition-colors"
          >
            {post.placement.thumbnailUrl !== null ? (
              // eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 사용자 사진이라 plain img를 쓴다(next/image 전환은 별건)
              <img
                src={post.placement.thumbnailUrl}
                alt={post.placement.title}
                className="bg-fog h-20 w-28 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="bg-fog h-20 w-28 shrink-0 rounded-xl" />
            )}
            <div className="min-w-0">
              <p className="text-ash text-[13px]">이 사진의 3D 배치</p>
              <p className="text-ink mt-1 truncate text-[16px] font-medium">
                {post.placement.title}
              </p>
              <p className="text-primary-700 mt-1 text-[13px]">배치 보러 가기 →</p>
            </div>
          </Link>
        )}

        {/* 첨부가 없을 때만 시뮬레이터 진입을 권한다 — 자동 첨부는 부결이라(결정 4) 이 링크는
            새 배치를 만들 뿐이고, 연결은 나중에 수정 화면 피커가 한다. */}
        {/* 판정은 placement가 아니라 placementId로 한다 — 첨부한 배치가 공개취소되면 서버는
            placement만 null로 답하고 FK는 남는다(결정 5). placement로 보면 이미 연결된 글에
            "만들기"를 권하게 된다. */}
        {post.placementId === null && (
          <Link
            href="/craft/new"
            className="border-ash/30 hover:border-ink text-ink mt-8 flex items-center justify-between rounded-2xl border p-4 text-[15px] font-medium transition-colors"
          >
            이 사진으로 배치 만들기
            <span className="text-primary-700 text-[14px]">시뮬레이터로 →</span>
          </Link>
        )}

        {/* 좋아요는 본문 끝에 라벨을 달아 크게 둔다 — 커뮤니티 상세와 같은 자리·모양. */}
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

        {/* 이전/다음 글 — 갤러리에서 본 순서 기준(위 글 = 이전, 아래 글 = 다음). */}
        {(prevEntry !== null || nextEntry !== null) && (
          <nav className="border-ash/20 mt-8 grid grid-cols-2 gap-4 border-t pt-6">
            {prevEntry !== null ? (
              <Link href={`/desk-feed/${prevEntry.id}`} className="group min-w-0">
                <p className="text-ash text-[13px]">← 이전 글</p>
                <p className="text-ink group-hover:text-primary-700 mt-1 truncate text-[15px] font-medium transition-colors">
                  {prevEntry.label}
                </p>
              </Link>
            ) : (
              <span />
            )}
            {nextEntry !== null ? (
              <Link href={`/desk-feed/${nextEntry.id}`} className="group min-w-0 text-right">
                <p className="text-ash text-[13px]">다음 글 →</p>
                <p className="text-ink group-hover:text-primary-700 mt-1 truncate text-[15px] font-medium transition-colors">
                  {nextEntry.label}
                </p>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>

      {/* 댓글 — 서버 영속이다. 카운트는 목록 응답의 totalCount(서버 값)를 그대로 쓴다.
          scroll-mt-24 — 레일의 댓글 버튼이 여기로 점프할 때 고정 헤더(64px)에 안 가리게. */}
      <div
        id={COMMENTS_ANCHOR_ID}
        className="font-swiss mx-auto mt-12 max-w-[720px] scroll-mt-24 tracking-[-0.03em]"
      >
        <h2 className="text-ink mb-4 text-[20px] font-medium">
          댓글 <span className="text-ash text-[16px] font-normal">{commentTotal}개</span>
        </h2>

        <form onSubmit={(event) => void handleSubmitComment(event)} className="mb-6 flex gap-2">
          {/* 자동완성 목록이 입력창 위에 뜬다 — 아래는 댓글 목록이라 가리면 맥락을 덮는다. */}
          <div className="relative flex-1">
            <textarea
              ref={commentInputRef}
              value={commentDraft}
              onChange={handleCommentChange}
              onSelect={(event) => syncMentionTrigger(event.currentTarget)}
              onKeyDown={handleCommentKeyDown}
              onBlur={() => setMentionTrigger(null)}
              placeholder="댓글을 남겨보세요. @로 사람을 멘션할 수 있어요"
              rows={2}
              className="border-ash/40 bg-paper text-ink placeholder:text-ash w-full resize-none rounded-[10px] border px-3 py-2 text-[14px]"
            />
            {isSuggestionOpen && (
              <div className="absolute right-0 bottom-full left-0 z-20 mb-1">
                <MentionSuggestionList
                  candidates={candidates}
                  activeIndex={activeIndex}
                  onSelect={insertMention}
                  isUnavailable={isUnavailable}
                />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmittingComment}
            className="bg-ink text-paper hover:bg-ink/85 flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            등록
          </button>
        </form>

        {comments.length === 0 ? (
          <p className="text-ash text-[14px]">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {comments.map((comment) => (
              <li key={comment.id} className="border-ash/20 flex items-start gap-2.5 border-t pt-4">
                <PersonAvatar name={comment.nickname} avatarUrl={null} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {comment.userId === null ? (
                      <span className="text-ink text-[14px] font-medium">{comment.nickname}</span>
                    ) : (
                      <Link
                        href={userProfileHref(comment.userId)}
                        className="text-ink text-[14px] font-medium hover:underline"
                      >
                        {comment.nickname}
                      </Link>
                    )}
                    <span className="text-ash text-[12px] tabular-nums">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                    {/* 남의 댓글 삭제는 서버가 403이라 본인 것만 버튼을 그린다. */}
                    {myUserId !== null &&
                      comment.userId !== null &&
                      String(comment.userId) === myUserId && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="text-ash hover:text-danger-500 ml-auto cursor-pointer text-[12px]"
                        >
                          삭제
                        </button>
                      )}
                  </div>
                  {/* 댓글은 평문이라 마크다운을 태우지 않는다 — 멘션만 조각내 링크로 그린다. */}
                  <p className="text-ink mt-1 text-[14px] leading-[1.6]">
                    <MentionText content={comment.content} mentions={comment.mentions} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {commentCursor !== null && (
          <button
            type="button"
            onClick={loadMoreComments}
            disabled={isLoadingComments}
            className="border-ash/40 text-ink hover:bg-fog mt-4 w-full cursor-pointer rounded-[10px] border py-2.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingComments ? '불러오는 중…' : '댓글 더 보기'}
          </button>
        )}
      </div>

      {/* 두 레일 — 데스크톱 여백에만 뜨는 중복 표시라 **DOM에서는 본문·댓글 다음이다**: 앞에 두면
          키보드·스크린리더가 글에 닿기 전에 버튼 3개 + 제품 링크 10개를 먼저 지난다. 화면 위치는
          `absolute`가 정하므로 순서를 뒤로 미뤄도 그대로다. sticky가 이 컨테이너 높이를 따라
          흐르므로 `relative`는 컨테이너에 있어야 한다. */}
      <DeskFeedActionRail
        isLiked={isLiked}
        likeCount={likeCount}
        onToggleLike={() => void handleToggleLike()}
        commentCount={commentTotal}
        commentsAnchorId={COMMENTS_ANCHOR_ID}
        onNotify={setToastMessage}
      />
      <DeskFeedProductRail
        ref={railRef}
        contentRef={railContentRef}
        products={railProducts}
        // 사진별 태그가 있는 글은 레일이 "보는 중인 사진"을 말한다 — 글 성질로 가른다.
        heading={hasPhotoTags ? '이 사진에 쓰인 제품' : '이 책상에 쓰인 제품'}
      />

      {toast !== null && (
        <Toast key={toast.seq} message={toast.message} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
};

export default DeskFeedDetail;
