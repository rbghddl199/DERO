// 데스크피드(실사진 갤러리) API 타입 — `/api/v1/desk-feeds` 한 벌(D34·ADR-0037,
// api-spec.md §6-보). 백엔드 DTO(community/dto/DeskFeed*)와 1:1이다. openapi 생성 타입이 아니라
// 손으로 쓴다 — `npm run api:types`는 local 프로파일 백엔드가 떠 있어야 해서(types/user.ts와 같은 선례).
//
// **post와 동형이다**(D34·ADR-0037): 제목(필수)과 마크다운 본문(필수)이 있고, 사진은 본문 안
// `![alt](imageKey)` 위치가 순서·대표의 정본이다. 사진 응답에는 순서 필드도 대표 플래그도 없다 —
// 목록 대표(`coverUrl`)는 서버가 본문 첫 이미지에서 파생한다.

/** `?sort` 값. 서버 기본값은 latest다(DeskFeedSort). */
export type DeskFeedSort = 'latest' | 'popular';

/**
 * 본문·댓글에 박힌 멘션 토큰 `[[user:ID]]`의 해석 결과(D35·ADR-0038 결정 2).
 *
 * **탈퇴·부재 사용자는 이 목록에 아예 없다** — `nickname: null`이 아니라 빠진다. 그래서 화면의
 * 폴백("@알 수 없음", 링크 없음)은 "목록에 없으면" 한 조건으로 선다. 조회는 하지 않는다 — 서버가
 * 이미 푼 표를 치환에만 쓴다.
 */
export interface DeskFeedMentionResponse {
  userId: number;
  /** **현재** 닉네임이다 — 닉변·닉네임 재선점에도 토큰은 원래 사람을 가리킨다. */
  nickname: string;
}

export interface DeskFeedImageResponse {
  id: number;
  /** 만료 없는 저장 키 — 본문 마크다운의 src가 이 값이다. */
  imageKey: string;
  /** 공개 이미지 URL(`/api/v1/images/{key}`, ADR-0035) — 만료 없다. 본문에는 key를 심고 화면이
   *  이 값으로 해석한다. */
  imageUrl: string;
  /** **이 사진에 찍힌 제품**(D37 개정·ADR-0040) — 글 단위 `usedProducts`의 부분집합이라 id만
   *  실린다(이름·가격은 그 목록이 답한다). 소프트 삭제된 제품은 여기서도 빠진다. */
  productIds: number[];
}

/** 상세에 싣는 첨부 배치 요약 카드. **배치가 PUBLIC이 아니면 응답에서 통째로 null이다**(결정 5). */
export interface DeskFeedPlacementSummaryResponse {
  id: number;
  title: string;
  thumbnailUrl: string | null;
}

/** 상세 하단 "사용된 제품" 카드 한 장(ADR-0034 결정 5). 클릭하면 **내부** `/product/{id}`로 간다.
 *  소프트 삭제된 제품은 응답에서 빠진다(정션 행은 남고 화면만 숨는다). */
export interface DeskFeedProductSummaryResponse {
  id: number;
  name: string;
  /** 자작 제품에는 가격이 없다(D20, CartItemResponse와 같은 계약). */
  priceKrw: number | null;
  /** 제품 대표 이미지(product_image.is_primary)의 presigned GET URL. 없으면 null. */
  imageUrl: string | null;
}

export interface DeskFeedSummaryResponse {
  id: number;
  /** 카드에 거는 이름 — 필수 필드다(≤100). 본문 첫 줄 파생 금지. */
  title: string;
  /** 마크다운 본문 전문 — 발췌를 어디서 자를지는 화면이 정한다(서버가 안 자른다). */
  content: string;
  /** 본문 토큰 해석표 — 카드가 발췌를 본문으로 그리므로 목록에도 실린다. */
  mentions: DeskFeedMentionResponse[];
  /** 본문 첫 인라인 이미지의 공개 URL. 아직 등록된 사진이 없으면 null. */
  coverUrl: string | null;
  imageCount: number;
  likeCount: number;
  commentCount: number;
  hashtags: string[];
  /** 첨부 배치 FK 원시값 — 카드의 "배치 연결됨" 뱃지용. 요약 카드는 상세만 싣는다. */
  placementId: number | null;
  /** 탈퇴하면 null(ON DELETE SET NULL) — 닉네임은 서버가 폴백 문구를 답한다. */
  authorId: number | null;
  nickname: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface DeskFeedDetailResponse {
  id: number;
  title: string;
  /** 마크다운 본문 — 인라인 이미지 `![alt](imageKey)`와 멘션 토큰 `[[user:ID]]`가 여기 산다. */
  content: string;
  /** 본문 토큰 해석표 — 화면은 조회 없이 치환만 한다. */
  mentions: DeskFeedMentionResponse[];
  hashtags: string[];
  /** 순서 없음 — 위치는 본문이 정하고 이 목록은 (imageKey → imageUrl) 해석표 + 표지 1장이다. */
  images: DeskFeedImageResponse[];
  likeCount: number;
  commentCount: number;
  /** 첨부가 있는 한 항상 실린다 — 수정 화면이 "첨부돼 있음"을 알아야 해제 UI를 그린다. */
  placementId: number | null;
  /** 배치가 PUBLIC일 때만 실린다. 공개취소·삭제면 null이고 화면은 카드를 숨긴다(결정 5). */
  placement: DeskFeedPlacementSummaryResponse | null;
  /** 사용된 제품 카드 — 빈 배열이면 화면이 섹션 자체를 숨긴다. 목록 응답에는 없다. */
  usedProducts: DeskFeedProductSummaryResponse[];
  authorId: number | null;
  nickname: string;
  profileImageKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListDeskFeedsParams {
  /** 사용자 태그 정확 일치 — 칩 필터다. */
  hashtag?: string;
  /** `'me'` 또는 사용자 id. `'me'`는 비로그인이면 400이다. */
  owner?: string;
  /** 역방향 조회 — "이 배치의 실사 사진". */
  placementId?: number;
  sort?: DeskFeedSort;
  cursor?: string | null;
  size?: number;
}

/** 작성·수정 공통 본문 — 백엔드는 두 record지만 필드가 같다(`PostSaveRequest`와 동형).
 *
 *  **수정은 부분 갱신이 아니라 전체 교체다**: `placementId: null`은 첨부 해제이고, `productIds`가
 *  빈 배열이면 제품 태그를 전부 뗀다. **사진은 여기 없다** — 등록·삭제 엔드포인트가 관리하고
 *  본문 안 `![alt](key)` 위치가 정본이다. */
export interface DeskFeedSaveRequest {
  /** ≤100, 공백만은 400. */
  title: string;
  /** 마크다운 본문 — 공백만은 400. */
  content: string;
  hashtags: string[];
  placementId: number | null;
  /** 사용된 제품 ≤10. 없거나 삭제된 제품이면 422다. */
  productIds: number[];
}

export interface DeskFeedImageUploadUrlsResponse {
  /** 요청한 contentTypes 순서 그대로. */
  items: { imageKey: string; uploadUrl: string }[];
}

export interface DeskFeedCommentResponse {
  id: number;
  userId: number | null;
  nickname: string;
  profileImageKey: string | null;
  content: string;
  /** 댓글 본문 토큰 해석표 — 본문과 같은 규칙이다. */
  mentions: DeskFeedMentionResponse[];
  createdAt: string;
}
