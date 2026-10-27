// 컬렉션 게시물 도메인 타입 — 커뮤니티(자유 글)와 달리 항상 실제 배치(placement) 1개를 끼고
// 있는 "데스크테리어 소개" 전용 글이다. 목록·상세 모두 이 placementId로 실제 배치를 조회한다.
import type { CollectionPhotoId } from '@/constants/collectionPosts';

export type CollectionPost = {
  id: string;
  title: string;
  description: string;
  author: string;
  /** 작성자의 사용자 id — 프로필(`/users/{id}`) 링크에 쓴다. 탈퇴한 작성자는 null이다
   *  (placement.user가 ON DELETE SET NULL이라 공개 배치는 남는다). */
  authorId?: number | null;
  /** ISO 8601 문자열(백엔드 Date 직렬화 형태) — 표시할 땐 `formatRelativeTime`을 거친다 */
  createdAt: string;
  /** '#태그' 필터·카드 표기용 */
  tags: string[];
  bookmarkCount: number;
  isBookmarked: boolean;
  likeCount: number;
  isLiked: boolean;
  /** 백엔드 실제 placement.id(숫자) — 로컬 3D 카탈로그 문자열 id가 아니다. 미리보기·예산·"가져오기"에 쓴다. */
  placementId: number;
  /** 목업 글 전용 — 실제 배치 표지 대신 쓰는 샘플 사진 키(`collectionPhotos.ts`가 resolve). 사용자가
   *  직접 올린 글은 이 필드가 없고 `thumbnailUrl`을 쓴다. 표지를 그릴 땐 `getCollectionCoverImage`를 거칠 것. */
  photoId?: CollectionPhotoId;
  /** 컬렉션 표지 — AI 상상도 대표 1장(`PlacementSummaryResponse.primaryImageUrl`)의 presigned GET
   *  URL이다. 시뮬레이터 스크린샷이 아니다(ADR-0015 결정 7 — 스크린샷은 내 작업실 카드용).
   *  컬렉션에 뜬 글(=`PUBLIC`)은 상상도를 만든 뒤에야 공개되므로 항상 있고, 비어 있으면 카드가
   *  샘플 사진으로 내려앉는다. */
  thumbnailUrl?: string;
};

/** 게시물 댓글 — 본인이 쓴 것만 삭제 가능(author === '나') */
export type CollectionComment = {
  id: string;
  postId: string;
  author: string;
  content: string;
  /** ISO 8601 문자열(백엔드 Date 직렬화 형태) — 표시할 땐 `formatRelativeTime`을 거친다 */
  createdAt: string;
};
