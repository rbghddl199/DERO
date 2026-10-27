// 게시글 기능의 상수 — 백엔드 에러 코드(ProblemDetail.code)와 목록·이미지 상한.

export const POST_ERROR_CODES = {
  postNotFound: 'POST_NOT_FOUND',
  /** 남의 글 수정·삭제 — 403 */
  postNotOwned: 'POST_NOT_OWNED',
  /** 남의 배치·내 비공개 배치·없는 배치를 본문 토큰으로 참조했을 때 — 400. **셋이 구분되지 않는다** */
  placementNotEmbeddable: 'POST_PLACEMENT_NOT_EMBEDDABLE',
  /** 21장째 — 업로드 PUT이 아니라 **1단계 upload-urls에서** "이미 있는 장수 + 요청 수"로 걸린다 */
  imageLimitExceeded: 'POST_IMAGE_LIMIT_EXCEEDED',
  unsupportedImageType: 'POST_UNSUPPORTED_IMAGE_TYPE',
  invalidImageKey: 'POST_INVALID_IMAGE_KEY',
  imageNotFound: 'POST_IMAGE_NOT_FOUND',
} as const;

/** 목록 한 페이지 크기 — 커서 페이지네이션의 '더 보기' 단위. */
export const POST_PAGE_SIZE = 12;

/** 목록 카드 제목 옆에 HOT 뱃지를 붙이는 좋아요 하한 — 이 수 '이상'이면 인기 글로 본다. */
export const HOT_POST_LIKE_THRESHOLD = 10;

/** 게시글 1건당 이미지 상한 — WAS가 강제한다(ADR-0013 결정 8). 폼에서 먼저 막아 400을 줄인다. */
export const POST_IMAGE_MAX_COUNT = 20;

/** presign이 받는 MIME은 이 넷뿐이다 — 그 밖은 400 `POST_UNSUPPORTED_IMAGE_TYPE`.
 *  `<input type="file">`의 accept에 그대로 넣어 고르는 단계에서 먼저 좁힌다(`image/*` 금지). */
export const POST_IMAGE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const POST_IMAGE_ACCEPT_ATTRIBUTE = POST_IMAGE_ACCEPTED_TYPES.join(',');
