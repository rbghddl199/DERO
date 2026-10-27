// 후처리 — GTAO 컨택트 섀도우 + SMAA 안티에일리어싱(TSL 노드 그래프)
// Single-scene-pass MRT pattern from GTAONode's own docs (the classic
// webgpu_postprocessing_ao example): color+normal via MRT, depth for free,
// AO multiplied into the linear pre-tonemap color, SMAA last. The r185 example
// moved to a prePass+TRAA variant — deliberately NOT copied: TRAA ghosts on
// drag-placement, and the extra full scene pass is too dear on integrated GPUs.
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  pass,
  mrt,
  output,
  emissive,
  normalView,
  nodeObject,
  vec3,
  vec4,
  uniform,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { outline } from 'three/addons/tsl/display/OutlineNode.js';
import { CAMERA_EXPOSURE } from '../render/renderer';
import { contourTint, LINE_STRENGTH, LINE_STRENGTH_ON, PIXEL_RATIO } from '../render/contourNode';

/** Post-FX handle: render the frame, and set the outline selection set. */
export interface PostFX {
  render: () => void;
  /** D17 selection outline — pass the union of selected+hovered product roots.
   *  Empty array = no outline (OutlineNode early-returns, per-frame cost ~0). */
  setOutline: (objects: THREE.Object3D[]) => void;
  /** D17 always-on contour lines on/off (uniform write — no pipeline rebuild). */
  setContour: (on: boolean) => void;
  contourOn: () => boolean;
  /** REQ-SIM-21 발광 블룸 튜닝 — strength/radius 유니폼 쓰기(파이프라인 재생성 없음). */
  setBloom: (strength: number, radius: number) => void;
  /** REQ-SIM-21 핫스팟 글레어 튜닝 — 조명 받은 표면용 두 번째 블룸의 strength/threshold.
   *  threshold는 pre-tonemap 선형 휘도라 방 조명·ambient floor와 짝이다(아래 주석 참조). */
  setGlare: (strength: number, threshold: number) => void;
}

export function createPostFX(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFX {
  const pipeline = new THREE.RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  // REQ-SIM-21 장식 발광 — 블룸 소스를 별도 emissive MRT 슬롯으로 뽑는다.
  // Not a luminance threshold on the composite: that threshold is a pre-tonemap
  // physical scale coupled to the room's ambient floor (raise the floor and the
  // white walls bloom), and Rec.709 luminance differs 2.7x between cyan (0.79)
  // and magenta (0.29) so one shared threshold can never fit both. The MRT slot
  // IS the selection — white walls write 0 here and can never bloom.
  // `emissive` is the PropertyNode NodeMaterial assigns in setupLighting, NOT
  // `materialEmissive`: the latter is a shared material reference to
  // `material.emissive`, which MeshBasicNodeMaterial (drag ghost, jointGizmo)
  // does not have — the uniform value would go undefined. three itself guards
  // `materialEmissive` behind an `isColor` check for the same reason.
  scenePass.setMRT(mrt({ output, normal: normalView, emissive: vec4(emissive, output.a) }));

  const scenePassColor = nodeObject(scenePass.getTextureNode('output'));
  const scenePassNormal = scenePass.getTextureNode('normal');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassEmissive = nodeObject(scenePass.getTextureNode('emissive'));

  const aoPass = ao(scenePassDepth, scenePassNormal, camera);
  // Research decision (2026-07-18): temporal filtering stays OFF — it needs
  // TRAA-style accumulation and brings the same ghosting artifacts.
  aoPass.useTemporalFiltering = false;
  // Integrated-GPU budget: half-res AO (denoise below hides the resolution).
  aoPass.resolutionScale = 0.5;
  // Scene is 1u=1m; 0.1 = 10cm reach keeps AO at object-meets-desk contact
  // points only (miniature-diorama grounding) instead of dimming whole walls.
  aoPass.radius.value = 0.1;

  // Spatial denoise of the half-res AO (AO value lives in .r — RedFormat target).
  // DenoiseNode is vec4 at runtime but its .d.ts drops the node type param,
  // so restore it for the .r swizzle below.
  const aoDenoised = denoise(
    aoPass.getTextureNode(),
    scenePassDepth,
    scenePassNormal,
    camera,
  ) as unknown as Node<'vec4'>;

  // Multiply AO into linear HDR color BEFORE tone mapping; the pipeline's
  // default output transform then applies ACES + exposure 1/20 unchanged.
  // D17 (2026-07-20 재지시): always-on dark contour lines on every edge — screen-
  // space depth+normal edge detection (contourNode.ts), multiplied in like AO.
  // Reuses the scene pass depth/normal GTAO already reads; no extra pass.
  const composite = scenePassColor
    .mul(vec4(vec3(aoDenoised.r), 1))
    .mul(vec4(contourTint(scenePassDepth, scenePassNormal), 1));

  // 발광 블룸 — emissive 슬롯만 흐려서 선형 pre-tonemap 공간에 가산한다.
  // threshold는 0으로 고정한다: MRT 슬롯이 이미 선택이고, 두 번째 게이트를 두면
  // 방 밝기·색상마다 다시 캘리브레이션해야 하는 문제가 그대로 돌아온다.
  // Deliberately NOT multiplied by 1/CAMERA_EXPOSURE (unlike the outline below):
  // the MRT emissive is already on the physical-lumen scale that the exposure is
  // calibrated to divide down — compensating would make bloom 20x too bright.
  // QA-tuned values (2026-07-25, 방 조명 OFF에서 스윕): 1.2/0.6에서 램프 셰이드가
  // 벽에 웜 헤일로를 흘리고 모니터 화면이 부드럽게 번지는데 D17 컨투어·베젤 엣지가
  // 살아 있다. 1.6/0.7부터 모니터 패널이 안개처럼 뜨고 2.5/0.5는 완전히 흐려진다.
  // 2026-07-26 박동규 하드웨어 판정으로 0.75/0.6 확정 — '은은'(0.5/0.35)과 '소프트'(1.0/0.85)의
  // 중간(DERO-162 변형 시트). Judged on real hardware, not the xvfb sweep above.
  const bloomStrength = uniform(0.75);
  const bloomRadius = uniform(0.6);
  const bloomPass = bloom(scenePassEmissive, bloomStrength, bloomRadius, 0);
  const bloomColor = (nodeObject(bloomPass) as unknown as Node<'vec4'>).rgb;

  // 핫스팟 글레어 — 위 블룸은 **발광하는** 표면만 잡는다. 램프 스팟이 상판에 만드는
  // 밝은 풀처럼 "발광이 아니라 밝게 비춰진" 표면은 emissive 슬롯에 0을 써서 전혀 번지지
  // 않았다(MRT 도입 실측: 셰이드 +38% · 모니터 화면 +63%인데 상판 풀은 +1.9%). 그래서
  // 씬 컬러를 소스로 하는 두 번째 블룸을 threshold와 함께 얹는다.
  // ADR-0003이 "threshold는 못 쓴다"고 결론낸 이유는 여기 해당하지 않는다: 그때 막힌 것은
  // 램프 셰이드 발광(18)이 방 조명 ON 흰 벽(10~25) **안에** 묻혀 있어 셰이드를 넣으면서
  // 벽을 빼는 값이 없다는 것이었다. 발광 선택은 이제 MRT가 무조건 처리하므로 이 threshold는
  // **조명 받은 표면**만 가르면 되고, 조명 핫스팟은 벽보다 훨씬 밝다.
  // 실측 (2026-07-25, xvfb·히어로 프리셋, pre-tonemap 선형 Rec.709 휘도):
  //   방 조명 ON 흰 벽 최대 21~22(좌벽, 뒷벽·바닥·상판은 <20) — 넘으면 안 되는 바닥선
  //   램프 상판 풀 최대 150~170(ON) / 100~150(OFF) — 벽의 5~7배라 분리 창이 22~100로 넓다
  // 50 = 벽 천장의 2.3배. **이 값은 방 조명 OFF의 ambient floor(scene.ts, intensity 7)와
  // 방 조명 ON의 key light와 짝이다** — 어느 쪽이든 올리면 흰 벽이 50을 넘어 벽이 통째로
  // 번진다(ADR-0003이 경고한 threshold↔floor 결합이 이 항에는 그대로 적용된다).
  // strength는 0.5: OFF에서 상판 풀 +48.8%(램프가 빛으로 읽힘)인데 ON 흰 벽은 +0.06~0.27%로
  // 정지. 1.0은 풀 +64.6%지만 램프 옆 벽이 OFF에서 +11%로 뿌예지기 시작한다. threshold 30은
  // ON에서 셰이드·화면까지 다시 먹어 이중 계산이 된다.
  // 2026-07-26 박동규 하드웨어 판정으로 0.4 확정 — '은은'(0.3)과 '소프트'(0.5)의 중간
  // (DERO-162 변형 시트). threshold 50은 위 리그 결합 때문에 그대로 둔다.
  const glareStrength = uniform(0.4);
  const glareThreshold = uniform(50);
  const glareRadius = uniform(0.6);
  const glarePass = bloom(scenePassColor, glareStrength, glareRadius, glareThreshold);
  const glareColor = (nodeObject(glarePass) as unknown as Node<'vec4'>).rgb;

  // D17 selection outline (webgpu_postprocessing_outline pattern). Selection is
  // driven by mutating outlinePass.selectedObjects; empty = the node early-returns
  // in updateBefore, so the un-selected steady state costs ~0. Composited AFTER
  // color×AO but BEFORE smaa, so: (a) the rim gets anti-aliased, and (b) GTAO
  // (which reads only the scene pass) can never darken the outline.
  const outlinePass = outline(scene, camera, {
    selectedObjects: [] as THREE.Object3D[],
    // start values (QA-tunable): warm rim, thickness a touch above 1.
    edgeThickness: uniform(1.4),
  });
  // Reference the outline through its pass-texture node (same path GTAO above uses)
  // so RenderPipeline registers the node's per-frame updateBefore() — a raw
  // .visibleEdge swizzle does not, leaving the composite RT empty. The composite
  // texture's .r = visible-edge mask, .g = hidden-edge mask (OutlineNode contract).
  const outlineTex = nodeObject(outlinePass.getTextureNode()) as unknown as Node<'vec4'>;
  // Warm cartoon rim for visible edges; muted brown where the edge is occluded.
  const visibleEdgeColor = uniform(new THREE.Color(0xffd9a0));
  const hiddenEdgeColor = uniform(new THREE.Color(0x6b533a));
  const edgeStrength = uniform(4.0);
  // The outline is added in linear pre-tonemap space, where scene colors are
  // physical-scale and the renderer later multiplies by CAMERA_EXPOSURE (1/20).
  // Without compensation the rim lands at ~2.6/20 ≈ 0.13 → invisible (verified
  // on WebGPU hardware). Pre-divide by the exposure so edgeStrength stays a
  // perceptual post-exposure dial.
  const outlineColor = outlineTex.r
    .mul(visibleEdgeColor)
    .add(outlineTex.g.mul(hiddenEdgeColor))
    .mul(edgeStrength)
    .mul(1 / CAMERA_EXPOSURE);

  // SMAA last, still pre-sRGB (SMAANode contract: apply before color transform).
  // Add the outline and both bloom terms as RGB terms (alpha 0) so the composite
  // alpha is untouched (the thumbnail capture path renders with alpha:true).
  pipeline.outputNode = smaa(
    composite.add(vec4(outlineColor, 0)).add(vec4(bloomColor, 0)).add(vec4(glareColor, 0)),
  );

  // Contour toggle: drive the strength uniform (0 = lines fully off). Starts OFF
  // (2026-08-05) — the user turns it on from the top bar. The "on" strength comes
  // from the authored constant, NOT from LINE_STRENGTH.value: that uniform is a
  // module singleton living for the whole page session, so a remount would snapshot
  // the current 0 as "on" and the toggle would be dead for the rest of the session.
  const contourOnStrength = LINE_STRENGTH_ON;
  let contourEnabled = false;
  LINE_STRENGTH.value = 0;

  return {
    render: () => {
      // Contour width is authored in CSS px; refresh the DPR every frame so the
      // line keeps its width when the window moves between displays or the user
      // zooms (both change getPixelRatio() without recreating the pipeline).
      PIXEL_RATIO.value = renderer.getPixelRatio();
      pipeline.render();
    },
    setOutline: (objects: THREE.Object3D[]) => {
      outlinePass.selectedObjects = objects;
    },
    setContour: (on: boolean) => {
      contourEnabled = on;
      LINE_STRENGTH.value = on ? contourOnStrength : 0;
    },
    contourOn: () => contourEnabled,
    setBloom: (strength: number, radius: number) => {
      bloomStrength.value = strength;
      bloomRadius.value = radius;
    },
    setGlare: (strength: number, threshold: number) => {
      glareStrength.value = strength;
      glareThreshold.value = threshold;
    },
  };
}
