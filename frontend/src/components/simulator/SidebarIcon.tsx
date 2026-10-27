// 좌측 사이드바(제품·벽·시점·실행취소/다시실행)·상단 흰 네비바(조명/외곽선 토글·나가기)·
// 우측 선택 패널 조작 절(복제·삭제·선택 해제, SelectedItemControls.tsx)용 라인 아이콘 —
// DESIGN-SYSTEM §3: 내비게이션은 일반 라인 아이콘 세트
import type { ReactElement, SVGProps } from 'react';

/** 좌측 사이드바 레일 카테고리 — 클릭하면 레일 옆에 플라이아웃 패널이 뜬다.
 *  '조명'(방 조명)은 2026-07-27 상단 네비바 토글로 옮겨가며 이 목록에서 빠졌다 —
 *  남은 '벽' 카테고리는 이름만 바뀌었을 뿐 예전 '조명' 카테고리 자리(벽 좌/전면/우
 *  스위치)를 그대로 잇는다. 'liked'(찜한 제품)는 2026-08-06 신규(LikedProductsPanel.tsx). */
export type SidebarCategory = 'product' | 'liked' | 'wall' | 'view' | 'estimate';
/** 사이드바 단발 액션(실행취소/다시실행) + 상단 네비바(나가기·조명·외곽선 토글) 공통
 *  아이콘 이름. `light`는 더 이상 레일 카테고리가 아니라 네비바의 방 조명 토글 아이콘. */
export type SidebarIconName =
  | SidebarCategory
  | 'undo'
  | 'redo'
  | 'save'
  | 'exit'
  | 'contour'
  | 'light'
  | 'lock'
  | 'zoom-in'
  | 'zoom-out'
  | 'duplicate'
  | 'delete'
  | 'fullscreen-enter'
  | 'fullscreen-exit'
  | 'cart'
  | 'edit'
  | 'close'
  | 'camera'
  | 'collision'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'tilt-up'
  | 'tilt-down'
  | 'lift-up'
  | 'lift-down'
  | 'gpu';

const PATHS: Record<SidebarIconName, ReactElement> = {
  undo: (
    <>
      <path d="M7 10h10a5 5 0 0 1 0 10h-3" />
      <path d="M11 6L7 10l4 4" />
    </>
  ),
  redo: (
    <>
      <path d="M17 10H7a5 5 0 0 0 0 10h3" />
      <path d="M13 6l4 4-4 4" />
    </>
  ),
  save: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 4v5h8V4" />
      <path d="M8 20v-6h8v6" />
    </>
  ),
  exit: (
    <>
      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h11" />
    </>
  ),
  contour: <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />,
  'fullscreen-enter': (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  'fullscreen-exit': (
    <>
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </>
  ),
  product: (
    <>
      <path d="M3 8l9-5 9 5-9 5-9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  light: (
    <>
      <path d="M12 4a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9Z" />
      <path d="M10 18h4M10.5 20.5h3" />
    </>
  ),
  /* CountPillToggle.tsx의 좋아요 하트(같은 시맨틱)와 그림은 다르지만(그쪽은 16×16 커스텀
     path) 이 세트의 24×24 라인 아이콘 스타일에 맞춘 표준 하트 윤곽. */
  liked: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  /* 좌/전면/우 3면 벽 개별 토글(REQ-ENV-04)을 그대로 도상화 — 가운데 패널이 전면. */
  wall: (
    <>
      <path d="M4 5v14" />
      <path d="M20 5v14" />
      <rect x="8" y="4" width="8" height="16" rx="1" />
    </>
  ),
  view: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  estimate: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.35-4.35" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.35-4.35" />
      <path d="M7.5 10.5h6" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20l0.9-4L16 4.9a1.6 1.6 0 0 1 2.3 0l0.8 0.8a1.6 1.6 0 0 1 0 2.3L8 19.1 4 20Z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  /* 충돌 무시 토글(상단 네비바) — 겹침 경고 자체를 도상화한 경고 삼각형. */
  collision: (
    <>
      <path d="M12 4.5L21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  /* ± 스핀 버튼 아이콘 6종 — 부동 SelectionToolbar와 함께 2026-08-03 삭제됐다가
     2026-08-04 복구(ADR-0023 결정 6·7). 링 기즈모·R 키는 큰 각을 휙 돌리는 도구로
     병존하고, 이 버튼은 1~5° 미세 조정 도구다. */
  /* 회전은 원호형 화살표 — 좌측 레일의 undo/redo(꺾인 화살표)와 한 화면에서 헷갈리면 안 된다. */
  'rotate-cw': (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  'rotate-ccw': (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  /* 기울기는 지지면 위 판의 옆모습 — 앞(왼쪽) 모서리가 내려가면 '앞으로', 뒤(오른쪽)가
     내려가면 '뒤로'. 정확한 의미는 aria-label/title이 정본이다. */
  'tilt-down': (
    <>
      <path d="M6.5 15.5l11-6" />
      <path d="M4 20h16" />
    </>
  ),
  'tilt-up': (
    <>
      <path d="M6.5 9.5l11 6" />
      <path d="M4 20h16" />
    </>
  ),
  /* 높이는 바닥선 위로 뜨는 화살표 — 회전(원호)·기울기(경사판)와 한 줄에 나란히 서므로
     세로 직선 화살표로 갈라 둔다. */
  'lift-up': (
    <>
      <path d="M12 16V5" />
      <path d="M8 9l4-4 4 4" />
      <path d="M4 20h16" />
    </>
  ),
  'lift-down': (
    <>
      <path d="M12 5v11" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 20h16" />
    </>
  ),
  // GPU 칩 — 하드웨어(그래픽) 가속 표시등(EditorTopBar)
  gpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </>
  ),
};

interface SidebarIconProps extends SVGProps<SVGSVGElement> {
  name: SidebarIconName;
}

const SidebarIcon = ({ name, ...props }: SidebarIconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {PATHS[name]}
  </svg>
);

export default SidebarIcon;
