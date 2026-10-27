// gizmo 드래그를 관절 값(회전 도 / 직선 mm)으로 환산하는 순수 벡터 수학 — three 임포트 없음(node 환경 유닛테스트), 조작(scene/jointGizmo)과 저작(/dev/rig)이 공유

export type Vec3 = [number, number, number];

/** 카메라에서 쏜 광선. `dir`은 단위 벡터여야 한다. */
export interface DragRay {
  origin: Vec3;
  dir: Vec3;
}

const EPS = 1e-6;

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < EPS ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * 광선과 평면의 교점. 평행이거나 평면이 광선 뒤면 null.
 * revolute 드래그는 관절 평면(피벗점 + 축 법선) 위 교점으로 각도를 잰다.
 */
export function rayPlaneHit(ray: DragRay, planePoint: Vec3, planeNormal: Vec3): Vec3 | null {
  const n = normalize(planeNormal);
  const denom = dot(ray.dir, n);
  if (Math.abs(denom) < EPS) return null; // 평행 — 교점 없음
  const t = dot(sub(planePoint, ray.origin), n) / denom;
  if (t <= 0) return null; // 광선 뒤쪽
  return [
    ray.origin[0] + ray.dir[0] * t,
    ray.origin[1] + ray.dir[1] * t,
    ray.origin[2] + ray.dir[2] * t,
  ];
}

/**
 * 축 둘레의 부호 있는 각도(도). 두 벡터를 축에 수직인 평면으로 투영해 잰다 —
 * 축 방향 성분은 무시되므로 드래그가 평면을 벗어나도 각도가 튀지 않는다.
 */
export function angleAroundAxisDeg(from: Vec3, to: Vec3, axis: Vec3): number {
  const n = normalize(axis);
  const proj = (v: Vec3): Vec3 => {
    const along = dot(v, n);
    return [v[0] - n[0] * along, v[1] - n[1] * along, v[2] - n[2] * along];
  };
  const a = proj(from);
  const b = proj(to);
  const sin = dot(cross(a, b), n);
  const cos = dot(a, b);
  return (Math.atan2(sin, cos) * 180) / Math.PI;
}

/**
 * 절댓값이 가장 큰 성분의 축을 고른다 — gizmo 링 축별 색 판정에 쓴다. 동률이면
 * x -> y -> z 우선순위로 결정론적이게 고른다.
 */
export function dominantAxis(v: Vec3): 'x' | 'y' | 'z' {
  const [x, y, z] = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  if (x >= y && x >= z) return 'x';
  if (y >= z) return 'y';
  return 'z';
}

/**
 * 광선과 관절 축 직선의 최근접점을 축 위 이동량(mm)으로 돌려준다.
 * 부호는 `axis` 방향이 양수. 광선이 축과 평행하면 null.
 */
export function rayAxisClosestMm(ray: DragRay, point: Vec3, axis: Vec3): number | null {
  const a = normalize(axis);
  const d = normalize(ray.dir);
  const w0 = sub(ray.origin, point);
  const b = dot(d, a);
  const denom = 1 - b * b;
  if (denom < EPS) return null; // 축과 평행 — 최근접점이 정해지지 않는다
  const s = (dot(a, w0) - b * dot(d, w0)) / denom;
  return s * 1000; // m -> mm (전역 규격 단위)
}
