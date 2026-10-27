// 사용자가 커뮤니티 게시물에 단 댓글 — 더미 시드 댓글(communityComments.ts)과 별개로, 이 세션에서
// 새로 작성/삭제한 댓글만 담는다. userPostsStore와 같은 이유로 persist를 쓰지 않는다 — 세션 메모리 전용.

import { create } from 'zustand';
import type { CommunityComment } from '@/components/community/types';

/** 댓글 없는 게시물의 셀렉터 폴백 — `?? []`처럼 매 렌더 새 배열을 만들면 useSyncExternalStore가
 *  스냅샷이 계속 바뀐다고 보고 무한 루프에 빠진다(frontend/CLAUDE.md 셀렉터 규칙과 같은 이유).
 *  참조가 고정된 이 상수로 폴백해야 한다. */
export const EMPTY_COMMENTS: readonly CommunityComment[] = [];

type CommunityCommentsStore = {
  /** 게시물 id → 그 글에 새로 달린 댓글(오래된 순) */
  byPostId: Readonly<Record<string, readonly CommunityComment[]>>;
  addComment: (comment: CommunityComment) => void;
  removeComment: (postId: string, commentId: string) => void;
};

export const useCommunityCommentsStore = create<CommunityCommentsStore>()((set) => ({
  byPostId: {},

  addComment: (comment) => {
    set((state) => ({
      byPostId: {
        ...state.byPostId,
        [comment.postId]: [...(state.byPostId[comment.postId] ?? []), comment],
      },
    }));
  },

  removeComment: (postId, commentId) => {
    set((state) => ({
      byPostId: {
        ...state.byPostId,
        [postId]: (state.byPostId[postId] ?? []).filter((comment) => comment.id !== commentId),
      },
    }));
  },
}));
