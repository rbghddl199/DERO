// 좋아요·북마크·댓글 API 응답 타입 — 백엔드가 ADR-0008대로 엔벨로프 없이 리소스를 그대로 돌려준다.
// openapi.d.ts는 백엔드를 띄워야 재생성되므로 이 계약이 붙는 동안은 손으로 쓴 이 파일이 정본이다
// (types/placement.ts와 같은 선례).

import type { CursorPage } from '@/types/api';

/** 커서 페이지에 총 개수가 실려 오는 응답 — 북마크·댓글 목록이 이 형태다.
 *  types/api.ts의 CursorPage는 totalCount가 없는 배치 목록 계약이라 여기서만 얹는다. */
export type TotalCursorPage<T> = CursorPage<T> & { totalCount: number };

/** GET /{resource}/{id}/like — 배치·제품·게시글이 같은 형태를 쓴다. */
export interface LikeStatusResponse {
  liked: boolean;
  likeCount: number;
}

/** GET /placements/{id}/bookmark — 북마크 여부와 담긴 그룹(그룹 미지정이면 null). */
export interface PlacementBookmarkStatusResponse {
  bookmarked: boolean;
  groupId: number | null;
}

export interface BookmarkGroupResponse {
  id: number;
  title: string;
  description: string | null;
  bookmarkCount: number;
  createdAt: string;
}

export interface CommentResponse {
  id: number;
  /** 탈퇴 회원의 댓글이면 null — 내 댓글 판정(삭제 버튼 노출)에 쓴다. */
  userId: number | null;
  nickname: string;
  content: string;
  createdAt: string;
}

export interface BookmarkGroupInput {
  title: string;
  description?: string | null;
}
