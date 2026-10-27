// 좋아요·북마크 API — PUT/DELETE/GET /{placements|products|posts}/{id}/like,
// PUT/DELETE/GET /placements/{id}/bookmark. 토글 계열은 전부 멱등이고 204(본문 없음)라,
// 호출부는 성공 후 GET으로 서버 값을 다시 확정(reconcile)한다.
import { apiClient } from './client';
import type { LikeStatusResponse, PlacementBookmarkStatusResponse } from '@/types/interaction';

export function getPlacementLike(placementId: number): Promise<LikeStatusResponse> {
  return apiClient.get<LikeStatusResponse>(`/placements/${placementId}/like`, {
    cache: 'no-store',
  });
}

export function putPlacementLike(placementId: number): Promise<void> {
  return apiClient.put<void>(`/placements/${placementId}/like`);
}

export function deletePlacementLike(placementId: number): Promise<void> {
  return apiClient.delete<void>(`/placements/${placementId}/like`);
}

export function getProductLike(productId: number): Promise<LikeStatusResponse> {
  return apiClient.get<LikeStatusResponse>(`/products/${productId}/like`, { cache: 'no-store' });
}

export function putProductLike(productId: number): Promise<void> {
  return apiClient.put<void>(`/products/${productId}/like`);
}

export function deleteProductLike(productId: number): Promise<void> {
  return apiClient.delete<void>(`/products/${productId}/like`);
}

export function getPostLike(postId: number): Promise<LikeStatusResponse> {
  return apiClient.get<LikeStatusResponse>(`/posts/${postId}/like`, { cache: 'no-store' });
}

export function putPostLike(postId: number): Promise<void> {
  return apiClient.put<void>(`/posts/${postId}/like`);
}

export function deletePostLike(postId: number): Promise<void> {
  return apiClient.delete<void>(`/posts/${postId}/like`);
}

export function getPlacementBookmark(
  placementId: number,
): Promise<PlacementBookmarkStatusResponse> {
  return apiClient.get<PlacementBookmarkStatusResponse>(`/placements/${placementId}/bookmark`, {
    cache: 'no-store',
  });
}

/** 저장과 그룹 이동이 같은 PUT 하나다 — 별도 이동 엔드포인트가 없다. groupId가 null이면 명시적 그룹 해제. */
export function putPlacementBookmark(placementId: number, groupId: number | null): Promise<void> {
  return apiClient.put<void>(`/placements/${placementId}/bookmark`, { groupId });
}

/** 본문 없는 PUT — 담기만 하고 이미 담긴 북마크의 그룹은 안 건드리는 부분 갱신이다. 그룹 선택 UI가
 *  없는 갤러리 카드가 쓴다(본문을 실으면 카드에서 누른 것만으로 그룹 배정이 풀린다). */
export function putPlacementBookmarkKeepingGroup(placementId: number): Promise<void> {
  return apiClient.put<void>(`/placements/${placementId}/bookmark`);
}

export function deletePlacementBookmark(placementId: number): Promise<void> {
  return apiClient.delete<void>(`/placements/${placementId}/bookmark`);
}
