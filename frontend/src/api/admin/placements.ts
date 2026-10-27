// admin — 배치 템플릿 시딩·해제 (PUT/DELETE /api/v1/admin/placements/{id}/template)와
// 그 화면이 읽는 운영진 배치 목록(AdminPlacementController + PlacementController 1:1).
//
// 토글은 단수 하위 리소스 + PUT/DELETE → 204다(api-spec.md §1 규칙 2). 본문이 없고 멱등이라
// 더블클릭·재시도가 안전하다.
//
// 목록은 관리자 전용 엔드포인트가 없다 — 운영진은 `GET /placements?owner=me`로 자기 배치를 본다.
// 그 경로는 로그인이 필요하므로(비로그인이면 401 PLACEMENT_OWNER_ME_REQUIRES_LOGIN) 전역
// apiClient가 아니라 Bearer를 붙이는 adminClient를 쓴다(api/admin/CLAUDE.md).

import { adminClient, withQuery } from '@/api/admin/client';
import type { CursorPage } from '@/types/api';
import type { PlacementSummaryResponse } from '@/types/placement';

/** 관리자 화면 한 번에 받아 오는 배치 수. 커서 페이지네이션이라 page 번호가 없다. */
export const ADMIN_PLACEMENT_PAGE_SIZE = 30;

export function listMyPlacements(cursor?: string): Promise<CursorPage<PlacementSummaryResponse>> {
  return adminClient.get<CursorPage<PlacementSummaryResponse>>(
    withQuery('/placements', { owner: 'me', size: ADMIN_PLACEMENT_PAGE_SIZE, cursor }),
  );
}

/** 템플릿 지정 → 204. 없는 배치면 404 PLACEMENT_NOT_FOUND다. */
export function markPlacementAsTemplate(placementId: number): Promise<void> {
  return adminClient.put<void>(`/admin/placements/${placementId}/template`);
}

/** 템플릿 해제 → 204. */
export function unmarkPlacementAsTemplate(placementId: number): Promise<void> {
  return adminClient.delete<void>(`/admin/placements/${placementId}/template`);
}
