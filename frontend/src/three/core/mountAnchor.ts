// 자석 결합 앵커 기하 (D22) — three 임포트 없음, VESA 판의 **접합면** 중앙을 계산

/** three의 Vector3·Box3 min/max를 그대로 넘길 수 있는 최소 형태. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * 결합 앵커(결합 피벗 로컬 좌표) — X·Y는 판 중앙, Z는 **접합면**(판의 +Z 바깥면).
 *
 * 박스 중심을 쓰면 판 두께의 절반이 모니터 패널 안에 박힌다(암 헤드가 화면을 뚫고
 * 나오는 현상). 모니터는 결합 피벗의 월드 쿼터니언을 그대로 물려받으므로
 * (`scene.tryMountMonitor`) 패널 뒷면의 법선은 언제나 피벗 로컬 +Z다 — 그 방향의
 * 지지면(max.z)이 패널 뒷면이 닿아야 할 유일한 평면이다. 관절 포즈와 무관한 값이라
 * (판 메쉬는 이 피벗의 자식이다) 팔을 어떻게 접어도 다시 계산할 필요가 없다.
 */
export function mountFaceAnchorLocal(min: Vec3Like, max: Vec3Like): Vec3Like {
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: max.z };
}
