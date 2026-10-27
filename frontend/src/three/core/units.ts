// 순수 단위 변환 유틸 — 규격 DB는 mm, 씬은 meter 기준, three 임포트 없음(node 환경 유닛테스트 필수)

export const MM_PER_M = 1000;

export interface Dims3 {
  x: number;
  y: number;
  z: number;
}

/** Spec dimensions in millimetres (as stored in the spec DB). */
export interface SpecDims {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export function mmToM(mm: number): number {
  return mm / MM_PER_M;
}

export function mToMm(m: number): number {
  return m * MM_PER_M;
}

/** Spec (mm) -> scene box dimensions (m). x=width, y=height, z=depth. */
export function specToBoxDims(spec: SpecDims): Dims3 {
  return {
    x: mmToM(spec.widthMm),
    y: mmToM(spec.heightMm),
    z: mmToM(spec.depthMm),
  };
}

export interface UniformScaleResult {
  scale: number;
  ratioError: number;
  withinTolerance: boolean;
}

/**
 * Uniform scale that maps a measured mesh box (m) onto the spec box (m).
 * Height (y) is the reference axis (glTF metres, Meshy auto_size is height-1-axis).
 * ratioError = worst per-axis divergence from a uniform fit; >5% = re-generate.
 */
export function uniformScaleToSpec(meshDims: Dims3, specDims: Dims3): UniformScaleResult {
  const rx = specDims.x / meshDims.x;
  const ry = specDims.y / meshDims.y;
  const rz = specDims.z / meshDims.z;
  const scale = ry;
  const ratioError = Math.max(Math.abs(rx / scale - 1), Math.abs(rz / scale - 1));
  return { scale, ratioError, withinTolerance: ratioError <= 0.05 };
}
