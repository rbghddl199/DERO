// admin — /api/v1/admin/search 트리(Admin{Product,Post,User,Placement}SearchController 1:1).
// 인덱스 운영은 **전량 재색인 하나뿐**이다(ADR-0019 결정 3) — 문서 단위 갱신은 쓰기 경로의
// AFTER_COMMIT 이벤트가 이미 한다.
//
// **부팅은 빈 인덱스만 만든다.** 채우는 건 이 호출뿐이라 새 인덱스가 붙은 배포 뒤에 한 번은
// 눌러야 하고, 안 누르면 검색이 계속 0건인데 에러도 안 난다.

import { adminClient } from '@/api/admin/client';

/**
 * 재색인 응답 — 색인한 문서 수. 네 인덱스가 모두 같은 모양이다(백엔드 `ReindexResponse` ·
 * 제품만 `ProductReindexResponse`이지만 필드는 동일).
 *
 * openapi.d.ts 재생성은 백엔드 local 프로파일이 떠 있어야 해서(ADR-0008) 여기 좁게 선언한다.
 * 화면은 이 모듈에서만 타입을 가져간다.
 */
export interface ProductReindexResponse {
  indexedCount: number;
}

/**
 * 전량 재색인 — 새 인덱스를 채운 뒤 별칭만 스왑하므로 도는 동안에도 검색은 산다(결정 5).
 * 실패는 503 `PRODUCT_SEARCH_UNAVAILABLE`로 오고 별칭은 옛 인덱스에 그대로 남는다.
 *
 * **analyzer만 바뀐 배포는 부팅이 못 잡는다** — `prepareIndex`의 자동 재색인은 최상위 필드 이름만
 * 비교하므로, 사전·형태소 설정이 바뀐 날엔 이 호출이 유일한 반영 수단이다.
 */
export function reindexProductSearch(): Promise<ProductReindexResponse> {
  return adminClient.post<ProductReindexResponse>('/admin/search/reindex');
}

/** 게시글 인덱스(`posts`) 전량 재색인. */
export function reindexPostSearch(): Promise<ProductReindexResponse> {
  return adminClient.post<ProductReindexResponse>('/admin/search/posts/reindex');
}

/** 사용자 인덱스(`users`) 전량 재색인 — 작성자 닉네임 검색이 여기서 나온다. */
export function reindexUserSearch(): Promise<ProductReindexResponse> {
  return adminClient.post<ProductReindexResponse>('/admin/search/users/reindex');
}

/** 배치 인덱스(`placements`) 전량 재색인 — 컬렉션 검색과 태그가 여기서 나온다. */
export function reindexPlacementSearch(): Promise<ProductReindexResponse> {
  return adminClient.post<ProductReindexResponse>('/admin/search/placements/reindex');
}
