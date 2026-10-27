// 드롭 착지 연출 트윈 — 순수 수학, three 임포트 없음. 물리 솔버·중력·바운스 아님(3d-scene.md 범위 규칙).

/** 착지 시작 높이 — 최종 위치보다 이만큼 위에서 내려온다 (m). */
export const DROP_HEIGHT_M = 0.04;

/** 착지 지속 시간 (ms). */
export const DROP_DURATION_MS = 140;

/** ease-out cubic — 빠르게 내려와 부드럽게 멎는다. 입력은 [0,1]로 클램프. */
export function dropEase(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - k, 3);
}

/** 경과 시간(ms)에 대한 최종 위치 대비 잔여 높이 (m). 끝나면 정확히 0. */
export function dropOffsetY(elapsedMs: number): number {
  if (elapsedMs >= DROP_DURATION_MS) return 0;
  return DROP_HEIGHT_M * (1 - dropEase(elapsedMs / DROP_DURATION_MS));
}

/** 착지 완료 여부 — tick 큐에서 제거하고 컨택트 그림자를 1회 갱신할 시점. */
export function dropDone(elapsedMs: number): boolean {
  return elapsedMs >= DROP_DURATION_MS;
}
