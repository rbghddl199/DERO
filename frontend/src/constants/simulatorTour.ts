// 시뮬레이터 첫 입장 코치마크 투어의 단계 표(문구·앵커·말풍선 방향)와 스포트라이트 기하 상수.

/** 말풍선이 구멍(하이라이트)의 어느 쪽에 붙는지. `center`는 구멍 가운데(화살표 없음). */
export type CoachSide = 'top' | 'right' | 'bottom' | 'left' | 'center';

export type CoachStepId = 'canvas' | 'library' | 'save' | 'wall' | 'camera' | 'estimate';

export type CoachStep = {
  readonly id: CoachStepId;
  /**
   * 앵커 후보 `data-testid` — 우선순위 순. 앞의 것이 DOM에 없으면 다음으로 넘어간다
   * (견적서가 접히면 `estimate-panel`이 사라지고 원형 배지 `estimate-fold`만 남는다).
   * 플라이아웃 안의 요소(`hud-library`·`hud-wall`·`hud-camera`)는 레일 버튼을 누르기 전엔
   * DOM에 없으므로 앵커로 쓰지 않는다 — 대신 항상 존재하는 레일 버튼을 가리킨다.
   */
  readonly testIds: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly preferredSide: CoachSide;
  /** 구멍을 대상 rect 안쪽으로 줄이는 비율(0~0.5). 뷰포트 전체를 덮는 캔버스 전용. */
  readonly insetRatio: number;
};

export const SIMULATOR_TOUR_STEPS: readonly CoachStep[] = [
  {
    id: 'canvas',
    testIds: ['sim-canvas'],
    title: '3D 화면 살펴보기',
    body: '빈 곳을 드래그하면 시점이 돌아갑니다. 휠을 굴려 확대·축소할 수 있습니다.',
    preferredSide: 'center',
    insetRatio: 0.14,
  },
  {
    id: 'library',
    testIds: ['rail-product'],
    title: '제품 담기',
    body: "왼쪽 레일의 '제품'을 누르면 제품 목록이 열립니다. 카드를 책상 위로 끌어다 놓으면 배치됩니다.",
    preferredSide: 'right',
    insetRatio: 0,
  },
  {
    id: 'save',
    testIds: ['save-layout'],
    title: '배치 저장',
    body: "'저장'을 누르면 지금 배치가 내 데스크테리어에 기록됩니다. 규격 위반이 남아 있으면 저장 후 안내가 뜹니다.",
    preferredSide: 'right',
    insetRatio: 0,
  },
  {
    id: 'wall',
    testIds: ['rail-wall'],
    title: '벽과 바닥 설정',
    body: "'벽'에서 벽을 켜거나 끄고, 방 테마와 벽까지의 거리를 조절합니다.",
    preferredSide: 'right',
    insetRatio: 0,
  },
  {
    id: 'camera',
    testIds: ['rail-view'],
    title: '시점 프리셋',
    body: "'시점'에서 히어로·1인칭·탑뷰 같은 미리 잡아둔 카메라로 옮겨 갑니다. 숫자키 1~5와 H도 같은 역할을 합니다.",
    preferredSide: 'right',
    insetRatio: 0,
  },
  {
    id: 'estimate',
    testIds: ['estimate-panel', 'estimate-fold'],
    title: '견적서 확인',
    body: '배치한 제품의 수량과 합계가 오른쪽 견적서에 쌓입니다. 왼쪽 화살표로 접어 둘 수 있습니다.',
    preferredSide: 'left',
    insetRatio: 0,
  },
];

/** 말풍선 폭 — `style.css`의 `.sim-coach-bubble { width }`와 반드시 같은 값. */
export const TOUR_BUBBLE_WIDTH_PX = 288;
/** 높이 실측 전 첫 렌더에서 쓰는 추정치. */
export const TOUR_BUBBLE_FALLBACK_HEIGHT_PX = 132;
/** 구멍과 말풍선 사이 간격. */
export const TOUR_BUBBLE_GAP_PX = 14;
/** 말풍선이 뷰포트 가장자리에서 최소한 떨어져 있어야 하는 거리. */
export const TOUR_VIEWPORT_EDGE_PX = 16;
/** 대상 rect를 구멍으로 만들 때 사방에 더하는 여유. */
export const TOUR_SPOTLIGHT_PAD_PX = 8;
/** 말꼬리 삼각형 한 변 — `style.css`의 `.sim-coach-bubble::after { border-width }`와 같은 값. */
export const TOUR_ARROW_SIZE_PX = 8;
/** 말풍선 라운드 반경 — 화살표가 코너를 타지 않게 하는 클램프 하한. */
export const TOUR_BUBBLE_CORNER_PX = 12;
