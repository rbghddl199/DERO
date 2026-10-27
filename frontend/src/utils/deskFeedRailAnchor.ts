// 데스크피드 상세 좌측 제품 레일이 매일 사진을 고른다 — "지금 보는 중인 사진"과 그 사진의 세로 범위.
// DOM을 모른다(호출부가 getBoundingClientRect 결과를 넘긴다) — 그래서 node 환경에서 테스트된다.
// selectionToolbarPos.ts와 같은 규약이다.
//
// **자리 계산(클램프)은 여기 없다** — `position: sticky`가 컴포지터에서 한다(DERO-630).
// 여기가 답하는 것은 "어느 사진이냐 + 그 사진이 문서 어디냐"뿐이고, 그 값은 스크롤해도 안 바뀌므로
// 프레임마다 DOM에 쓸 일이 없다.

/** 레일 상단 한계(px) = 고정 헤더 64px + 여백. `sticky top-28`(=112px)과 같은 값이며 자동 동기화되지
 *  않는다 — 레일의 sticky top을 바꾸면 여기도 함께 고쳐야 한다("보이는 만큼"의 기준선이다). */
export const RAIL_CEILING_PX = 112;
/** 새 사진의 레일이 뜨는 최소 노출 — 사진 높이의 이 비율만큼 보여야 뜬다(사라지는 것은 완전히 가려질 때). */
export const RAIL_SHOW_RATIO = 0.25;
/** 그 최소 노출의 상한(px) — 화면보다 훨씬 긴 사진에서 비율만 보면 영원히 안 뜬다. */
export const RAIL_SHOW_MAX_PX = 200;

/** 본문 사진 하나의 뷰포트 좌표(getBoundingClientRect 그대로). */
export interface RailPhotoRect {
  key: string;
  top: number;
  bottom: number;
  height: number;
}

export interface RailAnchor {
  /** 그 사진의 imageKey — 레일 내용(태그)을 고르는 값이다. */
  key: string;
  /** 사진 상단의 뷰포트 y(px) — 호출부가 컨테이너 기준으로 바꿔 넣는다. */
  top: number;
  /** 사진 높이(px) — sticky가 머물 구간의 길이다. */
  height: number;
}

/**
 * 지금 레일을 매달 사진을 고른다. 고를 사진이 없으면 null = **직전 사진을 그대로 둔다**
 * (그 사진은 이미 화면 밖이라 sticky가 알아서 밀어낸 상태다).
 *
 * - **가장 많이 보이는 사진**을 고른다 — 두 장이 걸쳐 있으면 화면을 차지한 쪽이 "보는 중"이다.
 * - **뜨는 조건과 사라지는 조건이 다르다**(히스테리시스): 새 사진은 일정 크기 이상 보여야 갈아타고,
 *   보고 있던 사진은 완전히 가려질 때까지 유지한다. 같은 임계를 쓰면 그 경계에서 깜빡인다.
 */
export const pickRailAnchor = (
  photos: RailPhotoRect[],
  options: { viewportHeight: number; shownKey: string | null },
): RailAnchor | null => {
  const { viewportHeight, shownKey } = options;
  let best: { photo: RailPhotoRect; visible: number } | null = null;
  for (const photo of photos) {
    // 천장~화면 아래 사이에 남은 높이 = 그 사진이 실제로 "보이는 만큼"이다.
    const visible = Math.min(photo.bottom, viewportHeight) - Math.max(photo.top, RAIL_CEILING_PX);
    if (visible <= 0) continue;
    if (best !== null && visible <= best.visible) continue;
    best = { photo, visible };
  }
  if (best === null) return null;
  const needed = Math.min(best.photo.height * RAIL_SHOW_RATIO, RAIL_SHOW_MAX_PX);
  if (best.photo.key !== shownKey && best.visible < needed) return null;
  return { key: best.photo.key, top: best.photo.top, height: best.photo.height };
};
