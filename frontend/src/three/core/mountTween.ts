// 자석 부착 트윈 — 순수 진행·이징 수학, three 임포트 없음. 실제 보간(위치 lerp·회전
// slerp)은 three가 있는 scene 쪽에서 한다(core는 three 금지). 물리 솔버가 아니라
// 키네마틱 연출이다 (D22, docs/context/3d-scene.md 범위 규칙).

/** 부착 지속 시간 (ms) — 순간이동으로 안 읽힐 만큼 길고, 다음 조작을 막지 않을 만큼 짧게. */
export const MOUNT_DURATION_MS = 180;

/** ease-out cubic — 빠르게 붙고 부드럽게 멎는다. dropEase와 같은 곡선이라 두 연출이 한 톤. */
export function mountEase(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - k, 3);
}

/** 경과 시간(ms)에 대한 보간 계수 [0,1]. 끝나면 **정확히 1** — 목표 포즈에 오차 없이 안착한다. */
export function mountProgress(elapsedMs: number): number {
  if (elapsedMs >= MOUNT_DURATION_MS) return 1;
  return mountEase(elapsedMs / MOUNT_DURATION_MS);
}

/** 트윈 완료 여부 — tick 큐에서 제거할 시점. */
export function mountDone(elapsedMs: number): boolean {
  return elapsedMs >= MOUNT_DURATION_MS;
}
