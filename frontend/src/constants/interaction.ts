// 좋아요·북마크·댓글 기능의 상수 — 백엔드 에러 코드(ProblemDetail.code)와 그룹 입력 길이 제한.

export const INTERACTION_ERROR_CODES = {
  placementNotFound: 'PLACEMENT_NOT_FOUND',
  commentNotFound: 'COMMENT_NOT_FOUND',
  commentNotOwned: 'COMMENT_NOT_OWNED',
  bookmarkGroupNotFound: 'BOOKMARK_GROUP_NOT_FOUND',
} as const;

/** 백엔드 Bean Validation과 같은 상한 — 넘으면 400이므로 폼에서 먼저 막는다. */
export const BOOKMARK_GROUP_TITLE_MAX_LENGTH = 50;
export const BOOKMARK_GROUP_DESCRIPTION_MAX_LENGTH = 255;

/** 목록 한 페이지 크기 — 커서 페이지네이션의 '더 보기' 단위. */
export const BOOKMARK_PAGE_SIZE = 20;
export const COMMENT_PAGE_SIZE = 20;
