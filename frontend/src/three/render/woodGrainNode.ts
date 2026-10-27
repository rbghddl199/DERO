// @ts-nocheck
// 나무 결(그레인) 색상 TSL 노드 — 위치 기반(positionLocal)이라 책상 상판 비율이 달라져도 UV가 늘어나지 않음
// TSL LANDMINE ISOLATION: all TSL node chaining lives here with @ts-nocheck so
// tsc never type-infers the node graph (that path OOMs ~70GB). Export signature
// is explicitly typed. `npm run typecheck` skips this file via @ts-nocheck.
// Wood grain is POSITION-based (positionLocal) so it never UV-stretches on a
// non-square desk top.
import { positionLocal, mx_noise_float, color, float, mix, vec3, sin, clamp } from 'three/tsl';

export function woodGrainColor(baseHex: number, grainHex: number, scale: number = 1): unknown {
  const p = positionLocal.mul(float(scale));
  // low-frequency warp so growth rings are organic, not ruler-straight
  const warp = mx_noise_float(p.mul(1.6)).mul(0.6);
  // rings run across the board width (x), modulated by warp. Low frequency +
  // gentle contrast so it reads as natural planks, not bright sin-stripes (W2).
  const rings = sin(p.x.mul(12).add(warp.mul(4)));
  const ringMix = rings.mul(0.5).add(0.5);
  // fine anisotropic fibre streaks along the grain
  const fibre = mx_noise_float(p.mul(vec3(120, 8, 22))).mul(0.08);
  const t = clamp(ringMix.mul(0.4).add(fibre).add(0.14), 0, 1);
  return mix(color(baseHex), color(grainHex), t);
}
