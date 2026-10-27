// 데스크피드(실사진 갤러리) 화면 상수 — 전용 도메인이라 예약 해시태그(마커)는 없다(ADR-0033 결정 1).
//
// 사진 MIME은 상수를 두지 않고 `constants/post.ts`의 `POST_IMAGE_ACCEPT_ATTRIBUTE`를 그대로 쓴다 —
// 백엔드 `DeskFeedService`의 표가 `PostService`와 같은 넷(png·jpeg·webp·gif)이라 값이 갈릴 여지가 없다.

/** 사용자 태그 상한 — 서버 검증(@Size(max = 5))과 같은 값이다. */
export const DESK_FEED_MAX_TAGS = 5;

/** 한 글의 사진 상한 — 서버 검증(MAX_IMAGES = 30)과 같은 값이다. */
export const DESK_FEED_MAX_IMAGES = 30;

/** 사용된 제품 태그 상한 — 서버 검증(@Size(max = 10))과 같은 값이다(ADR-0034 결정 5). */
export const DESK_FEED_MAX_PRODUCTS = 10;

/** 제목 상한 — 서버 검증(@Size(max = 100))과 같은 값이다. */
export const DESK_FEED_TITLE_MAX_LENGTH = 100;

/** 갤러리 한 페이지 카드 수 — 서버 기본값(20)과 같다. */
export const DESK_FEED_PAGE_SIZE = 20;
