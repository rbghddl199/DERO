// @ts-nocheck
// 벽면 마감 공용 TSL 색상 노드 — 페인트·우드 슬랫·벽돌·대리석·콘크리트 / 마루·타일·카펫
//
// TSL LANDMINE ISOLATION: 노드 체이닝은 전부 이 파일에 `@ts-nocheck`로 가둔다. 일반 `.ts`에
// 쓰면 tsc 인퍼런스가 ~70GB를 먹고 머신이 죽는다(2026-07-17 실사고 — `render/woodGrainNode.ts`
// 머리 주석). export 시그니처만 명시 타입이고, 반환은 `woodGrainColor`와 같은 `unknown`이다
// (호출부가 `colorNode`에 캐스팅해 문다).
//
// 계열은 **팔레트만 다르고 그래프 모양이 같다** — 그래서 계열마다 nodes 파일을 두지 않고
// 파라미터화한 한 벌이다. 격리 규칙(@ts-nocheck + 명시 시그니처)은 그대로 지킨다.
import {
  clamp,
  color,
  float,
  instanceIndex,
  min,
  mix,
  mx_noise_float,
  positionLocal,
  sin,
  smoothstep,
  varying,
  vec3,
} from 'three/tsl';
import { woodGrainColor } from '@/three/render/woodGrainNode';

/**
 * 페인트 벽 — 바닥 반사광을 흉내낸 세로 그라디언트(가짜 바운스) + 아주 약한 저주파 얼룩.
 *
 * **광원을 만들지 않는다**(ADR-0021 결정 2 — 창구는 `scene/lightSlots.ts` 하나다). 완전히
 * 균질한 단색 벽이 "백룸"으로 읽히는 원인이므로 밑동만 살짝 밝혀 깊이 단서를 만든다.
 * 벽 평면은 중심이 y = wallHeightM/2 이라 `positionLocal.y`가 −h/2..+h/2 다.
 *
 * `baseHex === bounceHex`면 mix가 항등이라 결과가 상수색이다 — 무채(NEUTRAL)가 현행
 * 단색 벽과 정확히 같은 값을 유지하는 방법이 그것이다(분기 없음).
 */
export function paintedWallColor(baseHex: number, bounceHex: number, wallHeightM: number): unknown {
  const t = positionLocal.y.div(float(wallHeightM)).add(0.5); // 0 = 바닥선, 1 = 천장선
  const rise = smoothstep(0.0, 0.6, t); // 바운스는 아래 60%에서만 산다
  const mottle = mx_noise_float(positionLocal.mul(0.7)).mul(0.04);
  return mix(color(bounceHex), color(baseHex), clamp(rise.add(mottle), 0, 1));
}

/**
 * 마루 — `woodGrainColor` 재사용(positionLocal 기반이라 60m ground에서도 UV가 안 늘어난다)에
 * 널 이음매를 얹는다. ground 평면은 눕혀져 있어 `positionLocal.x`가 월드 x다 — 이음매가
 * x 등간격이면 널은 z 방향(시선 방향)으로 뻗고, 결도 널 길이 방향과 나란해진다.
 */
export function plankFloorColor(
  baseHex: number,
  grainHex: number,
  plankWidthM: number,
  grainScale: number,
): unknown {
  const grain = woodGrainColor(baseHex, grainHex, grainScale);
  const f = positionLocal.x.div(float(plankWidthM)).fract();
  const edge = min(f, float(1).sub(f)); // 가장 가까운 이음매까지의 거리(널 폭 단위)
  // 홈은 넓고 깊게 — 0.03폭/0.5깊이로는 원경에서 안티에일리어싱에 먹혀 이음매가 사라졌다(1차 측정).
  const seam = smoothstep(0.0, 0.05, edge);
  return grain.mul(seam.mul(0.6).add(0.4));
}

/**
 * 우드 슬랫 판재 — 결은 판재 로컬 x축으로 링이 서므로 세로로 흐른다.
 *
 * InstancedMesh는 지오메트리 한 벌을 공유해 판재 수십 장이 완전히 똑같아진다. `instanceIndex`로
 * 명도만 ±7% 흔들어 기계 복붙 느낌을 지운다(황금비 배수의 소수부라 주기가 안 생긴다).
 * `instanceIndex`는 정점 단계 빌트인이라 `varying`으로 명시해 프래그먼트로 넘긴다.
 */
export function slatColor(baseHex: number, grainHex: number, grainScale: number): unknown {
  const jitter = varying(float(instanceIndex).mul(0.6180339887).fract().mul(0.14).add(0.93));
  return woodGrainColor(baseHex, grainHex, grainScale).mul(jitter);
}

/** **피치**(장 + 줄눈)가 210×70mm이므로 벽돌 면은 200×60mm, 줄눈 10mm다 — 표준형(190×57)이
 *  아니라 그보다 조금 크다. 벽 평면 로컬 x가 가로, y가 높이. */
const BRICK_W = 0.21;
const BRICK_H = 0.07;

/**
 * 벽돌 — 켜마다 반 장씩 어긋나는 영국식 쌓기(running bond).
 *
 * **장마다 색을 흔드는 것이 이 계열의 전부다.** 균일한 벽돌은 프린트한 벽지로 읽힌다 —
 * 벽돌 인덱스(장의 정수 좌표)로 잡음을 뽑아 장 안에서는 상수, 장끼리는 다르게 만든다.
 */
export function brickColor(baseHex: number, deepHex: number, mortarHex: number): unknown {
  const row = positionLocal.y.div(float(BRICK_H));
  const rowIndex = row.floor();
  // 정수 × 0.5의 소수부라 켜마다 0 또는 0.5다(분기 없는 지그재그).
  const col = positionLocal.x.div(float(BRICK_W)).add(rowIndex.mul(0.5).fract());
  const fx = col.fract();
  const fy = row.fract();
  // 줄눈 폭은 장 크기 대비 비율이라 가로·세로가 다르다. **경계 양쪽으로 램프가 서므로
  // 실제 줄눈은 이 값의 두 배다** — 10mm를 원하면 10/210/2, 10/70/2를 쓴다.
  const joint = min(
    smoothstep(0.0, 0.024, min(fx, float(1).sub(fx))),
    smoothstep(0.0, 0.071, min(fy, float(1).sub(fy))),
  );
  const tone = mx_noise_float(vec3(col.floor(), rowIndex, 0).mul(0.7))
    .mul(0.5)
    .add(0.5);
  const grit = mx_noise_float(positionLocal.mul(70)).mul(0.05).add(1); // 소성 표면의 거친 결
  return mix(color(mortarHex), mix(color(baseHex), color(deepHex), tone).mul(grit), joint);
}

/**
 * 대리석 — 도메인 워프를 먹인 사인의 능선(|sin| ≈ 0)이 곧 맥이다.
 *
 * `veinWidth`가 작을수록 맥이 얇고 선명하다. **오름차순 smoothstep만 쓴다** — WGSL은
 * edge0 > edge1을 정의하지 않아 역방향은 드라이버마다 결과가 갈린다.
 */
export function marbleColor(baseHex: number, veinHex: number, veinWidth: number): unknown {
  const p = positionLocal.mul(1.1);
  // 워프는 두 겹이다 — 한 겹으로 뽑은 1차 결과는 굵기가 일정한 국수가 흰 벽에 낙서된 그림이었다.
  const warp = mx_noise_float(p.mul(0.9))
    .mul(3.4)
    .add(mx_noise_float(p.mul(3.3)).mul(1.1));
  const ridge = sin(p.x.add(p.y.mul(1.6)).mul(1.8).add(warp)).abs();
  // 굵기 자체를 저주파로 흔든다 — 굵어졌다 얇아졌다 끊기는 것이 대리석 맥이다.
  const width = float(veinWidth).mul(mx_noise_float(p.mul(0.8)).mul(0.8).add(1));
  // **맥은 드물어야 돌로 읽힌다.** sin은 등간격 줄무늬라 워프만으로는 주기가 안 지워진다 —
  // 2차 결과가 물결무늬 벽지였던 원인이 이것이다. 저주파 마스크로 면의 절반 이상을 맥이
  // 아예 없는 무지 면으로 남긴다.
  const mask = clamp(mx_noise_float(p.mul(0.45)).mul(1.8).add(0.35), 0, 1);
  const main = float(1)
    .sub(smoothstep(0.0, width, ridge))
    .mul(mask);
  // 잔맥 — 주맥 곁에만 아주 흐리게 깔린다.
  const fineRidge = sin(p.x.mul(1.4).sub(p.y.mul(2.3)).mul(5.0).add(warp.mul(1.6))).abs();
  const fine = float(1)
    .sub(smoothstep(0.0, float(veinWidth * 2.5), fineRidge))
    .mul(0.12)
    .mul(mask);
  const haze = mx_noise_float(p.mul(6)).mul(0.05); // 결정 얼룩 — 맥 사이가 죽은 단색이 안 되게
  return mix(color(baseHex), color(veinHex), clamp(main.add(fine).add(haze), 0, 1));
}

/**
 * 노출 콘크리트 — 저주파 타설 얼룩 + 고주파 기공. 폼타이 자국 같은 이산 요소는 넣지 않는다
 * (마감은 연속 부조만 만든다, ADR-0021 결정 2).
 */
export function concreteColor(baseHex: number, blotchHex: number): unknown {
  const p = positionLocal;
  // 얼룩은 두 겹이다 — 한 겹으로 뽑은 1차 결과는 대비가 낮아 페인트 벽과 구분이 안 됐다.
  const broad = mx_noise_float(p.mul(0.55)).mul(0.5).add(0.5);
  const mid = mx_noise_float(p.mul(2.3)).mul(0.5).add(0.5);
  const pore = mx_noise_float(p.mul(26)).mul(0.5).add(0.5);
  // 거푸집 판 자국 — 주기 2π/10.5 = 약 600mm 가로 띠. **이것이 노출 콘크리트를 노출
  // 콘크리트로 읽게 하는 단서다**(폼타이 구멍 같은 이산 요소는 여전히 안 넣는다).
  const board = sin(p.y.mul(10.5)).mul(0.5).add(0.5).mul(0.1);
  const t = clamp(broad.mul(0.5).add(mid.mul(0.25)).add(pore.mul(0.15)).add(board), 0, 1);
  return mix(color(baseHex), color(blotchHex), t);
}

/**
 * 타일 바닥 — 정사각 격자 + 줄눈. ground 평면은 눕혀져 있어 **로컬 y가 월드 z**다
 * (`plankFloorColor`와 같은 이유로 positionLocal 기반이라 60m 평면에서도 UV가 안 늘어난다).
 */
export function tileFloorColor(baseHex: number, groutHex: number, tileSizeM: number): unknown {
  const u = positionLocal.x.div(float(tileSizeM));
  const v = positionLocal.y.div(float(tileSizeM));
  const fu = u.fract();
  const fv = v.fract();
  const grout = min(
    smoothstep(0.0, 0.028, min(fu, float(1).sub(fu))),
    smoothstep(0.0, 0.028, min(fv, float(1).sub(fv))),
  );
  // 장마다 명도를 살짝 흔든다 — 자기질 타일도 로트마다 톤이 다르다.
  const tone = mx_noise_float(vec3(u.floor(), v.floor(), 0).mul(1.3))
    .mul(0.06)
    .add(1);
  const polish = mx_noise_float(positionLocal.mul(9)).mul(0.04).add(1);
  return mix(color(groutHex), color(baseHex).mul(tone).mul(polish), grout);
}

/**
 * 카펫 — 파일(pile)은 한 방향으로 누운 고주파 잡음이다. 축마다 주파수를 달리 줘 이방성을
 * 만들고(그래서 결이 보인다), 저주파 얼룩으로 눌린 자국을 흉내낸다.
 *
 * **주파수 상한은 안티에일리어싱이 정한다.** ground는 60m 평면이고 절차 색 노드에는 밉이
 * 없어 원경이 나이퀴스트 아래로 떨어진다 — `plankFloorColor`가 이음매를 넓혀야 했던 것과
 * 같은 축이다. 45/m(주기 22mm)는 책상 주변에서 결이 보이면서 원경 모아레는 피하는 값이다.
 */
export function carpetColor(baseHex: number, fibreHex: number): unknown {
  const fibre = mx_noise_float(positionLocal.mul(vec3(45, 12, 1)))
    .mul(0.5)
    .add(0.5);
  const patch = mx_noise_float(positionLocal.mul(2.5)).mul(0.12);
  return mix(color(baseHex), color(fibreHex), clamp(fibre.mul(0.55).add(patch), 0, 1));
}
