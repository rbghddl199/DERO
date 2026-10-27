// 북마크 그룹 CRUD API — GET/POST/PATCH/DELETE /bookmark-groups.
// 배치 하나의 북마크 여부·저장·해제는 여기가 아니라 api/interaction.ts에 있다(배치 리소스 하위 경로).
// 북마크한 배치 **목록**은 `GET /placements?bookmarked=me&bookmarkGroup=`이다(api/placement.ts) —
// 종전 `GET /bookmarks`는 삭제됐다(DERO-343): 카드에 필요한 썸네일 URL·상세 링크를 배치 요약이
// 이미 다 갖고 있고, 북마크 전용 응답은 스토리지 key만 줘서 이미지를 못 그렸다.
import { apiClient } from './client';
import type { BookmarkGroupInput, BookmarkGroupResponse } from '@/types/interaction';

export function getBookmarkGroups(): Promise<BookmarkGroupResponse[]> {
  return apiClient.get<BookmarkGroupResponse[]>('/bookmark-groups', { cache: 'no-store' });
}

export function createBookmarkGroup(input: BookmarkGroupInput): Promise<BookmarkGroupResponse> {
  return apiClient.post<BookmarkGroupResponse>('/bookmark-groups', input);
}

export function updateBookmarkGroup(
  groupId: number,
  input: BookmarkGroupInput,
): Promise<BookmarkGroupResponse> {
  return apiClient.patch<BookmarkGroupResponse>(`/bookmark-groups/${groupId}`, input);
}

/** 그룹만 지운다 — 담겨 있던 북마크는 살아남아 '그룹 없음'이 된다. */
export function deleteBookmarkGroup(groupId: number): Promise<void> {
  return apiClient.delete<void>(`/bookmark-groups/${groupId}`);
}
