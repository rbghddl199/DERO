// 게시글(Post) 도메인 와이어 타입 — GET/POST/PUT/DELETE /posts와 본문 이미지 2단계 presign(ADR-0013).
// openapi.d.ts는 백엔드를 local 프로파일로 띄워야만 재생성되므로(`npm run api:types`) 이 계약이
// 붙는 동안은 손으로 쓴 이 파일이 정본이다 — types/placement.ts·types/interaction.ts와 같은 선례다.

/** 목록 카드 한 줄. `thumbnailUrl`은 is_primary 이미지의 presigned GET URL이고 이미지가 없으면 null. */
export interface PostSummaryResponse {
  id: number;
  title: string;
  content: string;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  /** '#' 없는 순수 태그명 */
  hashtags: string[];
  /** 작성자가 탈퇴하면 null이다(post.user_id는 ON DELETE SET NULL) */
  authorId: number | null;
  nickname: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/** `imageUrl`은 presigned GET URL — 본문 마크다운(`![alt](imageUrl)`)에 그대로 꽂는다. */
export interface PostImageResponse {
  id: number;
  imageKey: string;
  imageUrl: string;
  isPrimary: boolean;
}

export interface PostDetailResponse {
  id: number;
  title: string;
  content: string;
  hashtags: string[];
  images: PostImageResponse[];
  likeCount: number;
  commentCount: number;
  authorId: number | null;
  nickname: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/** POST·PUT 공용 요청 — 배치 참조는 FK가 아니라 content 안의 `[[placement:ID]]` 토큰이다(ADR-0013 결정 1). */
export interface PostSaveRequest {
  title: string;
  content: string;
  hashtags: string[];
}

export interface PostImageUploadUrlsRequest {
  contentTypes: string[];
}

export interface PostImageUploadUrlItem {
  imageKey: string;
  uploadUrl: string;
}

export interface PostImageUploadUrlsResponse {
  items: PostImageUploadUrlItem[];
}

export interface PostImageRegisterRequest {
  imageKey: string;
  isPrimary: boolean;
}

/** `GET /posts`의 쿼리 파라미터 — 전부 선택이고 생략하면 "전체, 최신순"이다(비로그인 200). */
export interface ListPostsParams {
  /** '#' 없는 순수 태그명 */
  hashtag?: string;
  owner?: 'me' | number;
  /**
   * 서버 검색어(제목·본문·태그·작성자, ADR-0027). `hashtag`·`owner` 필터와 **같이** 걸린다.
   * ES가 죽으면 이 파라미터를 실은 요청만 503 `POST_SEARCH_UNAVAILABLE`이고 폴백은 없다
   * (ADR-0019 결정 6).
   */
  q?: string;
  cursor?: string | null;
  size?: number;
}
