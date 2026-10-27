// 컬렉션 글 목록/상세 — `GET /placements`(REQ-COM-01) 실연동. 2026-08-01 목업
// (components/collection/collectionPosts.ts)을 걷어냈다(DERO-339).
//
// 컬렉션에 뜨는 건 publishStatus=PUBLIC 하나뿐이고 그 필터는 서버가 이미 갖고 있다 — 여기서 한 번 더
// 거르지 않는다. 비로그인도 200이라 로그아웃 상태에서 컬렉션가 401로 깨지지 않는다(가시성 정본은
// 백엔드 PlacementRepositoryImpl.visibleTo).
//
// 태그도 2026-08-07부터 서버 값이다(DERO-493) — 공개 전환 때 붙인 `placement_hashtag`가
// 목록 응답의 `tags`로 온다. 화면 연출용 데모 태그(collectionDemoTags.ts)는 그래서 지웠다.
// 북마크 여부(isBookmarked)와 좋아요 수는 2026-08-02부터 서버 값이 그대로 온다(DERO-343) —
// 갤러리의 로컬 오버라이드 스토어는 그래서 없앴다.

import { listPlacements } from './placement';
import type { CollectionPost } from '@/components/collection/types';
import type { PlacementSort, PlacementSummaryResponse } from '@/types/placement';

/** 한 번에 받아 오는 카드 수. 매스너리가 3열이라 3의 배수로 둔다. */
export const COLLECTION_PAGE_SIZE = 12;

export interface CollectionPage {
  posts: CollectionPost[];
  nextCursor: string | null;
  hasNext: boolean;
}

function toCollectionPost(placement: PlacementSummaryResponse): CollectionPost {
  return {
    // 컬렉션 글 id가 곧 배치 id다 — 컬렉션엔 별도 글 테이블이 없고 배치 그 자체를 보여준다.
    id: String(placement.id),
    title: placement.title,
    description: placement.description ?? '',
    author: placement.ownerNickname ?? '알 수 없음',
    authorId: placement.ownerId,
    createdAt: placement.createdAt,
    tags: placement.tags,
    // 북마크 카운터는 서버에 없다(북마크는 카운터 없는 조인 테이블) — 0으로 둔다. isBookmarked만
    // 요청자 기준 서버 값이다(DERO-343).
    bookmarkCount: 0,
    isBookmarked: placement.isBookmarked,
    likeCount: placement.likeCount,
    isLiked: false,
    placementId: placement.id,
    // 컬렉션 표지는 대표 상상도 한 장이다(ADR-0015 결정 7) — 시뮬레이터 스크린샷
    // (placement.thumbnailUrl)은 내 작업실 카드용이라 여기선 쓰지 않는다. 상상도가 없으면 카드가
    // 샘플 사진으로 내려앉는다.
    thumbnailUrl: placement.primaryImageUrl ?? undefined,
  };
}

/**
 * 무한 스크롤 한 페이지. `cursor`가 null이면 첫 페이지다.
 *
 * `q`는 서버 검색이다(DERO-492, ADR-0027) — 실리면 정렬 대신 관련도 순서로 오고, ES가 죽으면
 * 이 요청만 503 `PLACEMENT_SEARCH_UNAVAILABLE`이다(폴백 없음, 호출부가 배너로 알린다).
 *
 * `tag`는 태그 칩 필터다(DERO-493) — 서버가 정확히 일치하는 태그만 남긴다. 받아 온 페이지
 * 안에서 거르면 커서 너머의 배치를 못 찾는다(검색을 서버로 옮긴 것과 같은 이유).
 */
export async function getCollectionPage(
  sort: PlacementSort = 'latest',
  cursor: string | null = null,
  q = '',
  tag: string | null = null,
): Promise<CollectionPage> {
  const page = await listPlacements({
    publishStatus: 'PUBLIC',
    sort,
    q,
    hashtag: tag ?? undefined,
    cursor,
    size: COLLECTION_PAGE_SIZE,
  });

  return {
    posts: page.content.map(toCollectionPost),
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
  };
}

/**
 * 상세 진입용 단건 조회. `GET /placements/{id}`가 아니라 `?ids=`를 쓰는 이유는 상세 응답엔 작성자
 * 닉네임·좋아요 수가 없어서다 — 카드와 같은 요약이 필요하고 요약을 주는 건 목록 쪽이다. 배치 본문
 * (책상·아이템)은 CollectionDetail이 따로 `getPlacement`를 친다.
 *
 * 볼 수 없는 배치는 에러가 아니라 빈 목록으로 온다(목록은 존재 여부를 흘리지 않는다) — 호출부는
 * undefined를 404로 다룬다.
 */
export async function getCollectionPost(id: string): Promise<CollectionPost | undefined> {
  const placementId = Number(id);
  if (!Number.isInteger(placementId)) return undefined;

  const page = await listPlacements({ ids: [placementId], size: 1 });
  const found = page.content[0];
  return found === undefined ? undefined : toCollectionPost(found);
}

// `getCollectionRemixes`는 2026-08-03에 삭제됐다 — 상세 하단 "이 데스크의 리믹스" 섹션
// (`CollectionRemixes.tsx`)을 화면에서 없애면서(사용자 요청) 유일한 호출부가 사라졌다. 원본 표시는
// 상세가 `getPlacement`의 `sourcePlacement`로 따로 그리므로 그쪽은 영향이 없다.

// `createCollectionPost`는 2026-08-02에 삭제됐다 — I/O 없는 함수가 여기서 "글"을 만들어 주는 게
// 상상도 없는 글이 컬렉션에 뜨던 버그의 발원지였다. 사용자가 입력한 제목·설명은 배치에 저장되고
// (D33·ADR-0036 — 종전 localStorage 사이드카는 폐기), 카드는 서버 목록만으로 세운다.
