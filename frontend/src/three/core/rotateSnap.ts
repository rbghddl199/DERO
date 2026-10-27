// 회전 직접 조작(링 기즈모·R 키)의 순수 각도 수학 — 45° 자석 스냅과 링 위 한 점의 yaw 환산. three 임포트 없음(node 유닛테스트 대상)

/** 한 번의 R 키 회전량이자 자석 스냅 격자 (도) — ADR-0022 결정 7. */
export const ROTATE_STEP_DEG = 45;

/** 격자에서 이 각도 **미만**으로 벗어났을 때만 자석이 문다 (도). 정확히 경계값이면
 *  스냅하지 않는다 — 격자 사이 39°~51° 구간을 사용자가 그대로 지정할 수 있어야 한다.
 *  (자석 강도 자체는 ADR-0022의 "범위 밖"이라 이 티켓에서 6°로 정했다.) */
export const ROTATE_SNAP_THRESHOLD_DEG = 6;

const RAD2DEG = 180 / Math.PI;

/** [0,360) 정규화 — 링 드래그가 한 바퀴를 넘겨도 각도가 튀지 않게 한다. */
function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * 자석 스냅 — `stepDeg` 배수에서 `thresholdDeg` **미만**으로 벗어난 각도는 그 배수로
 * 끌어당기고, 그보다 멀면 그대로 둔다. 반환값은 항상 [0,360)이다(360은 0으로).
 */
export function snapYawDeg(
  deg: number,
  stepDeg: number = ROTATE_STEP_DEG,
  thresholdDeg: number = ROTATE_SNAP_THRESHOLD_DEG,
): number {
  const norm = normalize(deg);
  const nearest = Math.round(norm / stepDeg) * stepDeg;
  return Math.abs(norm - nearest) < thresholdDeg ? normalize(nearest) : norm;
}

/**
 * 회전 링 평면 위의 점(링 중심 기준 XZ 오프셋)을 yaw(도)로 환산한다. three의 Y축
 * 회전 규약과 같은 각이다 — `rotation.y = θ`면 로컬 +Z가 월드 `(sinθ, ·, cosθ)`를
 * 향하므로 `atan2(dx, dz)`가 곧 그 방향을 가리키는 yaw다.
 */
export function yawFromRingOffset(dx: number, dz: number): number {
  return normalize(Math.atan2(dx, dz) * RAD2DEG);
}
