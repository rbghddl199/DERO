// @ts-nocheck
// 화면공간 컨투어 라인 — depth·normal 버퍼로 모든 실루엣·크리스 엣지에 얇은 다크 라인을 곱셈 합성(추가 렌더 패스 없음)
// TSL LANDMINE ISOLATION (woodGrainNode.ts:1 precedent): heavy TSL node chaining
// lives under @ts-nocheck so tsc never type-infers the graph (that path OOMs).
//
// D17 (2026-07-20 재지시, 박동규): ALWAYS-ON screen-space contour lines — thin dark
// "drawn" lines on EVERY edge, interior creases included (a Fresnel rim cannot ink a
// crease seen head-on, which is why the previous approach was replaced). Edges are
// detected from the scene pass's depth + normal buffers (the same textures GTAO
// already consumes — no extra render pass):
//   - depth discontinuity (4-neighbour view-Z delta, metres)  -> silhouettes
//   - normal discontinuity (4-neighbour 1-dot(n) delta)       -> creases
// The line is composited MULTIPLICATIVELY (mix toward a dark ink colour), so it is
// scale-invariant in the pre-tonemap physical-units space — NO CAMERA_EXPOSURE
// compensation needed (unlike the additive selection-outline overlay; see
// frontend/CLAUDE.md 지속 이슈). Selected/hovered products additionally get the warm
// OutlineNode rim, which is what visually distinguishes selection from the ever-
// present dark contour.
import {
  Fn,
  uv,
  vec2,
  vec3,
  float,
  uniform,
  screenSize,
  cameraNear,
  cameraFar,
  perspectiveDepthToViewZ,
  mix,
  smoothstep,
} from 'three/tsl';
import { Color } from 'three/webgpu';

// QA-tunable dials (shared, whole scene).
// Authored "on" strength. Kept as a plain constant so postfx can restore it on
// toggle-on without snapshotting the live uniform (which starts at 0 since the
// contour now defaults to off — snapshotting 0 would kill the toggle for good).
export const LINE_STRENGTH_ON = 0.85;
export const LINE_STRENGTH = uniform(LINE_STRENGTH_ON); // 0 = off, 1 = full ink
export const LINE_COLOR = uniform(new Color(0x2a2018)); // near-black warm ink
// Line thickness is authored in CSS px, NOT device texels. The tuned Retina look
// (DPR 2) was 2.5 texels = 1.25 CSS px; expressed as texels the same dial gave a
// 2x thicker, visibly dashed line on DPR 1 displays. Multiplying by the live pixel
// ratio keeps the CSS-px width constant across displays (postfx feeds PIXEL_RATIO
// from renderer.getPixelRatio(), which is clamped to 2 in renderer.ts).
export const LINE_WIDTH_CSS = uniform(1.25); // sample-offset radius in CSS px
export const PIXEL_RATIO = uniform(1); // driven by postfx each frame
export const DEPTH_THRESHOLD = uniform(0.02); // metres of view-Z jump = silhouette
export const NORMAL_THRESHOLD = uniform(0.4); // 1-dot(n) jump = crease

/**
 * Multiplicative ink tint (vec3, 1 = untouched) from depth+normal edge detection.
 * Multiply the pre-tonemap composite colour by this node.
 */
export function contourTint(depthTex, normalTex) {
  return Fn(() => {
    const uvc = uv();
    // Wider sample radius = wider detected discontinuity band = thicker line.
    // CSS px -> device texels. Floored at 1 texel: below that the 4 neighbours
    // round back onto the centre texel and the edge test stops detecting anything.
    const texel = vec2(1, 1)
      .div(screenSize)
      .mul(LINE_WIDTH_CSS.mul(PIXEL_RATIO).max(float(1)));

    const viewZ = (uvOff) =>
      perspectiveDepthToViewZ(depthTex.sample(uvOff).r, cameraNear, cameraFar);
    const nrm = (uvOff) => normalTex.sample(uvOff).xyz;

    const right = uvc.add(vec2(texel.x, 0));
    const left = uvc.sub(vec2(texel.x, 0));
    const up = uvc.add(vec2(0, texel.y));
    const down = uvc.sub(vec2(0, texel.y));

    // silhouette: biggest view-Z jump to any 4-neighbour (metres; scene is 1u=1m)
    const zc = viewZ(uvc).toVar();
    const dz = viewZ(right)
      .sub(zc)
      .abs()
      .max(viewZ(left).sub(zc).abs())
      .max(viewZ(up).sub(zc).abs())
      .max(viewZ(down).sub(zc).abs());
    const depthEdge = smoothstep(DEPTH_THRESHOLD, DEPTH_THRESHOLD.mul(2), dz);

    // crease: biggest normal deviation (1 - dot) to any 4-neighbour
    const nc = nrm(uvc).toVar();
    const dn = float(1)
      .sub(nc.dot(nrm(right)))
      .max(float(1).sub(nc.dot(nrm(left))))
      .max(float(1).sub(nc.dot(nrm(up))))
      .max(float(1).sub(nc.dot(nrm(down))));
    const normalEdge = smoothstep(NORMAL_THRESHOLD, NORMAL_THRESHOLD.mul(1.5), dn);

    const edge = depthEdge.max(normalEdge).mul(LINE_STRENGTH);
    return mix(vec3(1), LINE_COLOR, edge);
  })();
}
