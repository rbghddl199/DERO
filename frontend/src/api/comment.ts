// 배치 댓글 API — GET/POST /placements/{id}/comments, DELETE /placements/{id}/comments/{commentId}.
// 목록 조회만 비로그인도 200이고, 작성·삭제는 로그인이 필요하다(남의 댓글 삭제는 403 COMMENT_NOT_OWNED).
import { apiClient } from './client';
import type { CommentResponse, TotalCursorPage } from '@/types/interaction';

export interface GetCommentsParams {
  cursor?: string;
  size?: number;
}

export function getComments(
  placementId: number,
  { cursor, size }: GetCommentsParams = {},
): Promise<TotalCursorPage<CommentResponse>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (size) params.set('size', String(size));
  const query = params.toString();
  return apiClient.get<TotalCursorPage<CommentResponse>>(
    `/placements/${placementId}/comments${query ? `?${query}` : ''}`,
    { cache: 'no-store' },
  );
}

export function createComment(placementId: number, content: string): Promise<CommentResponse> {
  return apiClient.post<CommentResponse>(`/placements/${placementId}/comments`, { content });
}

export function deleteComment(placementId: number, commentId: number): Promise<void> {
  return apiClient.delete<void>(`/placements/${placementId}/comments/${commentId}`);
}
