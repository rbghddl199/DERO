// 선택 툴바(SelectionToolbar)의 화면 위치 계산 — 앵커 기준 배치 + 뷰포트 클램프.
// DOM을 모른다(호출부가 offsetWidth/innerWidth 측정값을 넘긴다) — 그래서 node 환경에서 테스트된다.
// simulatorTourGeometry.ts와 같은 규약이지만 그쪽 computeBubblePlacement는 재사용할 수 없다:
// edgePx를 사방 균등 적용해 "위쪽만 상단바 높이"라는 비대칭 한계를 표현하지 못하고,
// 안 들어가면 반대편으로 뒤집는 fallback이 있어 드래그 중 툴바가 점프한다.

/** 아이템 바운딩박스 상단에서 툴바 아래쪽 모서리까지의 여백(px). */
export const ANCHOR_GAP_PX = 14;
/** 뷰포트 좌·우·아래 가장자리 여백(px). */
export const EDGE_MARGIN_PX = 12;
/** 툴바 상단 한계(px) = .editor-topbar 64px + 20px 간격.
 *  .editor-sidebar / .editor-right-column의 top:84px와 같은 값·같은 근거이며 자동 동기화되지
 *  않는다 — 상단바 높이를 바꾸면 style.css의 그 두 곳과 여기를 함께 고쳐야 한다. */
export const TOP_LIMIT_PX = 84;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ToolbarSize {
  w: number;
  h: number;
}

export interface Viewport {
  vw: number;
  vh: number;
}

const clamp = (value: number, min: number, max: number): number => {
  // max < min(툴바가 가용 폭보다 큰 경우)이면 min을 택한다 — 화면 밖으로 나가는 쪽보다 낫다.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

/** 앵커(아이템 bbox 상단 중앙)를 기준으로 툴바를 얹고 뷰포트 안으로 클램프한 좌상단 CSS px. */
export const clampToolbarPos = (
  anchor: ScreenPoint,
  size: ToolbarSize,
  vp: Viewport,
): { left: number; top: number } => ({
  left: clamp(anchor.x - size.w / 2, EDGE_MARGIN_PX, vp.vw - EDGE_MARGIN_PX - size.w),
  // 위로 밀려도 아래로 뒤집지 않는다 — 뒤집으면 드래그 중 툴바가 점프해 더 산만하다.
  top: clamp(anchor.y - size.h - ANCHOR_GAP_PX, TOP_LIMIT_PX, vp.vh - EDGE_MARGIN_PX - size.h),
});
