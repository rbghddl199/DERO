// 컬렉션 표지 사진 키 — `src/assets/sample/*_desk/`의 샘플 사진 3장을 가리키는 식별자다.
// 2026-08-01 목록이 실제 `GET /placements`로 바뀌면서(DERO-339) 목업 시드(SEED_POSTS·
// MOCK_PLACEMENT_IDS)와 생성 로직(components/collection/collectionPosts.ts)은 삭제했고, 이 타입만
// 남는다 — 아직 썸네일을 안 찍은 배치의 폴백 표지를 고르는 데 쓴다.

/** `src/components/collection/collectionPhotos.ts`가 이 키로 실제 이미지를 resolve한다 */
export type CollectionPhotoId = 'black_desk' | 'design_desk' | 'white_desk';

/**
 * 컬렉션 글 하나에 붙일 수 있는 태그 개수 상한 (2026-08-02 확정).
 * 입력(작업실의 `craft/CollectionPublishSheet`·`CollectionEditForm`)과 표시(`CollectionDetail`)가
 * 같은 값을 쓴다 — 신규 글은 이 수를 넘길 수 없으니 상세에서 잘리지 않는다.
 * **프론트 전용 상한이다** — 서버(`placement_hashtag`)는 20까지 받는다.
 */
export const COLLECTION_MAX_TAGS = 5;
