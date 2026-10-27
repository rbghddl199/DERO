// 선택 아이템의 3D 월드 좌표 → 화면 CSS px 좌표를 매 프레임 전달하는 다리.
// R3F useFrame은 Canvas 안에서만 동작하고 선택 툴바(SelectionToolbar.tsx)는 Canvas
// 밖 형제 DOM이라, 좌표를 React 상태로 안 돌리고(매 프레임 리렌더 방지) 구독자
// 하나에 직접 밀어준다 — RenderLoop(SimulatorCanvas.tsx)가 publish, 툴바가 subscribe.
// 2026-08-03 폐기됐다가 2026-08-04 복구(ADR-0023 결정 6) — 폐기 사유였던 '조작 중
// 동반 상승'은 이 다리가 아니라 조작 중에도 좌표를 따라간 것이 원인이었고, 그 동결은
// 구독자(툴바) 쪽에서 한다.

export interface ScreenPoint {
  x: number;
  y: number;
}

export type SelectionAnchorListener = (pos: ScreenPoint | null) => void;

let listener: SelectionAnchorListener | null = null;

export function subscribeSelectionAnchor(fn: SelectionAnchorListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function publishSelectionAnchor(pos: ScreenPoint | null): void {
  listener?.(pos);
}
