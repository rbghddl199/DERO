// @ts-nocheck
// 창밖 포털 TSL — 픽셀별 시선으로 뽑는 하늘 + 지면 평면 + 가상 깊이 세 겹의 패럴랙스 실루엣 (ADR-0031 결정 1·2·5)
//
// TSL LANDMINE ISOLATION: 노드 체이닝은 전부 이 파일에 `@ts-nocheck`로 가둔다. 일반 `.ts`에
// 쓰면 tsc 인퍼런스가 ~70GB를 먹고 머신이 죽는다(`finishes/nodes.ts` 머리 주석과 같은 이유).
// export 시그니처만 명시 타입이고 반환은 `unknown`이다(호출부가 노드 슬롯에 캐스팅해 문다).
//
// **시간 축은 유니폼 하나다.** 구름·별이 같은 `windowTime`을 쓰고 씬의 `tick`이 그 값 하나만
// 올린다 — 애니메이션이 셰이더 재빌드를 부르지 않는다. 시간대도 유니폼(`nightMix`)이라
// 주·야 전환이 재컴파일 없이 섞인다(계열 전환 스톨과 같은 축).
//
// **원근은 지오메트리가 아니라 여기서 만든다**(ADR-0031 결정 1). 판은 창 사각형 크기 한 장
// 뿐이고, 카메라가 돌면 하늘은 시선 방향을 따라 무한 원거리처럼 미끄러지고 실루엣 세 겹은
// 가상 깊이(`FAR/MID/NEAR_DEPTH_M`)만큼 서로 어긋난다. 1차 구현의 UV 고정 단판이 "붙인
// 사진"으로 반려된 원인이 이것이다. 지면은 층이 아니라 **진짜 평면에 투영**한다(`groundDepth`).
import {
  abs,
  cameraPosition,
  clamp,
  color,
  float,
  length,
  max,
  min,
  mix,
  modelWorldMatrixInverse,
  mx_noise_float,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/** 창밖이 쓰는 시간(초). 씬의 `tick`이 올린다 — 프레임마다 값 하나만 바뀐다. */
const windowTime = uniform(0);

/** 0 = 주간, 1 = 야간. 시간대 전환은 이 유니폼 하나이고 재질을 다시 짓지 않는다. */
const nightMix = uniform(0);

export function advanceWindowTime(dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds)) return;
  // **접지 않는다.** 구름 이류는 비주기 잡음에 시간을 평행이동으로 먹이고 별 사인의 주기는
  // 그와 무리비라, 어떤 값에서 접어도 그 순간 구름이 순간이동하고 위상이 튄다. float32
  // 유니폼이라 t가 1e5초(≈28시간)쯤 되면 sin 인자의 양자화가 눈에 띄지만, 한 번의 시뮬레이터
  // 세션이 그만큼 이어지지 않는다 — 확실한 한 시간마다의 점프보다 낫다.
  windowTime.value += dtSeconds;
}

export function setWindowNight(night: boolean): void {
  nightMix.value = night ? 1 : 0;
}

/** 테스트·계측용 — 유니폼이 실제로 도는지, 시간대가 실렸는지 밖에서 확인한다. */
export function windowTimeValue(): number {
  return windowTime.value;
}

export function windowNightValue(): number {
  return nightMix.value;
}

// --- 좌표계 ------------------------------------------------------------------
// 판은 창 사각형 크기 그대로 벽면에 끼워져 있고(`scene/windowView.ts`), 그 위 한 점에서
// 밖으로 나가는 시선 하나가 이 셰이더의 입력이다. 두 좌표를 쓴다:
//
//   ang  = 시선의 탄젠트 좌표(dir.xy / −dir.z). 원점이 정면, y = 0이 **눈높이 수평선**이다.
//          무한 원거리(하늘)는 이 값만으로 정해진다 — 카메라가 움직이면 하늘이 미끄러진다.
//   층   = 깊이 d의 가상 평면과 만나는 점: (P.xy + ang·d). 수평선 기준 높이는 카메라 눈높이를
//          뺀 값이라, 어느 깊이에서도 지면선이 눈높이에 온다.
//
// 원근이 성립하는 지점이 여기다: 같은 화면 이동에 대해 d가 큰 층일수록 덜 움직인다.

/** 스침각에서 탄젠트가 발산하는 것을 막는 하한(≈ 정면에서 83°). */
const MIN_FORWARD = 0.12;

/** 실루엣 세 겹의 가상 깊이(m) — 원경 스카이라인 · 길 건너 블록 · 바로 앞 저층이다.
 *  깊이 비(740 : 380 : 360)가 카메라가 돌 때 층이 어긋나는 속도 비다.
 *  (2026-08-09 박동규 프로토타입 판정값 — prototype/window-portal-look 슬라이더 실측) */
const FAR_DEPTH_M = 740;
const MID_DEPTH_M = 380;
const NEAR_DEPTH_M = 360;

/**
 * 창밖 지면의 높이(m, **눈높이 기준**이라 음수) = 이 방이 몇 층에 있는가.
 *
 * **−76m는 고층이다**(2026-08-09 레퍼런스: 고층에서 내려다본 도심). 지면이 눈높이 바로
 * 아래(−1.4m)면 건물이 전부 수평선 위로 솟아 창을 벽처럼 막고 길만 조금 보인다 —
 * "낮 배경이 별로다" 반려의 구조적 원인이었다. 수십 m 아래로 내리면 건물 옥상이 **수평선
 * 아래**에 깔려, 가까운 동은 낮게 보이고 먼 동일수록 수평선으로 쌓여 올라간다. 하늘이
 * 화면 절반을 갖는 것도 이 값의 결과다. −76은 프로토타입 판정값(2026-08-09).
 *
 * 층의 밑동은 여기서 끊긴다 — 마스크가 창 밑변까지 이어지면 지면 층이 통째로 가려진다.
 */
const GROUND_H_M = -76;

// --- 색 ----------------------------------------------------------------------

const DAY_ZENITH = 0x3f7fd0;
const DAY_HORIZON = 0xa9cdec;
const DAY_CLOUD = 0xffffff;
const DAY_GROUND = 0x8d8f92; // 아스팔트 — 수렴선이 포장 이음매로 읽힌다
const SUN_GLOW = 0xfff0cf;
const NIGHT_ZENITH = 0x050916;
const NIGHT_HORIZON = 0x1b2340;
const NIGHT_CLOUD = 0x2a3352;
const NIGHT_GROUND = 0x0b0f1c;
const STAR_COLOR = 0xdfe8ff;
/** 도시 세 겹 — 멀수록 대기 원근으로 하늘에 물들어 밝고 흐리다. 이 명도 순서가 거리다
 *  (2026-08-09 개정: 주간 나무·잔디를 도시로 갈았다, ADR-0031 결정 5). */
const CITY_FAR_DAY = 0xd6e2ee;
const CITY_MID_DAY = 0xbccbdc;
const CITY_NEAR_DAY = 0x9fb0c4;
const CITY_FAR_NIGHT = 0x18233c;
const CITY_MID_NIGHT = 0x111a2e;
const CITY_NEAR_NIGHT = 0x0d1424;
const CITY_WINDOW = 0xffd9a0;

/**
 * 하늘 그라디언트가 천정색에 닿는 고도(탄젠트).
 *
 * **이 파일의 모든 눈금은 "창문으로 보이는 각도"에 맞춘다.** 방 안에서 창을 보면 시선이 거의
 * 수평이라 보이는 고도는 좁다 — 화면에서 줄무늬 눈금으로 실측한 값이 **히어로 tan
 * −0.26..+0.10**(HUD 툴바가 창 윗변을 가린다) · **전면 −0.08..+0.30**이다. 그 밖에 둔 하늘 꼭대기·
 * 해·스카이라인은 화면에 0px다(1차 구현이 정확히 그랬고, 포털로 바꾼 뒤에도 첫 실측에서
 * 근경 나무 우듬지를 4m로 잡았다가 창을 통째로 덮었다). 층의 높이(m)를 그 층의 깊이로
 * 나눈 값이 고도 탄젠트다 — 상수를 고치기 전에 그 나눗셈부터 하라.
 */
const SKY_SPAN_TAN = 0.1;

/** 3D 단서 3종 (2026-08-09 "건물이 2D다" 지적 → 프로토타입 판정값). 고층 시점이라 옥상이
 *  보여야 상자로 읽힌다 — 옥상 안길이는 열 폭 × 이 배율, 측면 그늘·동 윤곽선이 나머지 둘이다. */
const ROOF_DEPTH_RATIO = 1.6;
const SIDE_SHADE = 0.45;
const EDGE_LINE = 0.11;

/**
 * 노출 보정 배율. 렌더러가 `toneMappingExposure = 1/20`이라(`render/renderer.ts`) 0..1 색을
 * 그대로 내면 창밖이 새까맣다 — 씬 배경이 `backgroundIntensity = 20`으로 같은 보정을 받는
 * 것과 같은 축이다. 야간 배율은 `roomRig`의 `NIGHT_ENV_SCALE`(0.25)과 짝이다.
 *
 * **주간 배율은 8.5다**(프로토타입 판정값, 종전 9). 20이면 하늘 바탕이 ACES 곡선의 어깨
 * (입력 0.85)에 얹혀 파랑이 다 날아가고, 12에서도 하늘이 흰 판이었다 — 레퍼런스의 "파란
 * 하늘 + 흰 구름"은 하늘을 어깨 아래로 내려야 나온다(2026-08-09 실측). 구름만 흰색이라 그
 * 대비가 남는다.
 *
 * **올리지 마라 — 번짐은 배율이 아니라 emissive MRT 경유가 정석이다**(ADR-0031 결정 2).
 * 글레어 블룸 문턱 50(`postfx.ts`)이 이 값과 짝이라, 배율을 올리면 하늘 바탕(≈0.85×12=10)이
 * 문턱을 넘어 **창밖이 아니라 프레임 전체**가 번진다.
 */
const DAY_SCALE = 8.5;
const NIGHT_SCALE = 4;

/**
 * 창밖 한 장 — 하늘·구름·별·원경 스카이라인·근경 나무를 **셰이더 하나**로 계산한다.
 *
 * 실루엣을 기하로 세우지 않는 이유는 견적 신뢰다(ADR-0030 결정 8, ADR-0031이 유지): 창밖에
 * 진짜 오브젝트가 있으면 사용자가 배치한 제품과 화면에서 구분되지 않는다. 같은 이유로 GLB를
 * 쓰지 않고 씬 배경(스튜디오 그라디언트)도 교체하지 않는다.
 *
 * `sunAlongSign`은 그 면의 햇살이 오는 쪽(벽 로컬 +1 / −1)이다 — 해 **원반은 없고**(ADR-0031
 * 결정 2: "뿌연 빛무리" 반려 이력) 그쪽 하늘이 넓게 밝아지는 과노출 그라디언트가 방향을
 * 말한다. 화면의 밝은 쪽과 방에 드는 햇살이 반대편이면 즉시 거짓말로 읽힌다.
 *
 * **반환은 두 슬롯이다** — `emissiveNode`는 번져야 하는 몫(하늘·켜진 창), `colorNode`는 또렷해야
 * 하는 몫(지면·건물·나무)이다. 이유는 파일 끝 분리 주석에 있다.
 */
export function windowSceneryNodes(sunAlongSign: 1 | -1): {
  colorNode: unknown;
  emissiveNode: unknown;
} {
  const camLocal = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
  const dir = normalize(positionLocal.sub(camLocal));
  // 벽 밖은 −z다(판 법선이 방 안쪽 +z). 정면 성분으로 나눠 탄젠트 좌표를 만든다.
  const ang = vec2(dir.x, dir.y).div(max(dir.z.negate(), float(MIN_FORWARD)));
  const elev = ang.y;

  // --- 하늘: 시선 방향만의 함수 = 무한 원거리
  const up = clamp(elev.div(float(SKY_SPAN_TAN)), 0, 1);
  const daySky = mix(color(DAY_HORIZON), color(DAY_ZENITH), up);
  const nightSky = mix(color(NIGHT_HORIZON), color(NIGHT_ZENITH), up);

  // --- 구름: 이류하는 두 겹 잡음. 수평선 위 띠에만 살아 하늘 꼭대기는 맑다.
  const drift = windowTime.mul(0.004);
  // 뭉게구름 — 덩어리가 커야 적운으로 읽힌다(레퍼런스). 잔 주파수는 가장자리 결만 낸다.
  // 주파수 2.85·문턱 0.72(구름 적고 덩어리 드문드문)는 프로토타입 판정값(2026-08-09).
  const cloudRaw = mx_noise_float(vec3(ang.x.mul(2.85).add(drift), elev.mul(4.93), 0.0))
    .mul(0.7)
    .add(mx_noise_float(vec3(ang.x.mul(7.98).sub(drift.mul(1.6)), elev.mul(13.4), 3.0)).mul(0.22))
    .add(0.5);
  // 히어로 가시 상한이 +0.10이라 띠를 그 아래로 내린다 — 0.07에서 시작하면 히어로 프레임에
  // 구름이 사실상 0px다(이 파일이 경고하는 눈금 함정을 구름 상수로 다시 밟았다).
  const cloudBand = smoothstep(0.005, 0.05, elev).mul(float(1).sub(smoothstep(0.45, 1.0, elev)));
  const cloud = clamp(smoothstep(0.72, 0.92, cloudRaw).mul(cloudBand), 0, 1);

  // --- 별: 성긴 고주파 잡음의 봉우리. 반짝임은 위상이 별마다 다른 사인 하나다.
  const starField = mx_noise_float(vec3(ang.x.mul(70), elev.mul(70), 7.0));
  const twinkle = sin(windowTime.mul(2.1).add(starField.mul(37)))
    .mul(0.4)
    .add(0.6);
  // 별도 같은 이유로 수평선 바로 위부터 뜬다 — 스카이라인 위 좁은 띠가 히어로에서 보이는
  // 전부다(가시 상한 +0.10).
  const star = smoothstep(0.62, 0.8, starField)
    .mul(twinkle)
    .mul(smoothstep(0.0, 0.03, elev));

  // --- 해 방향의 과노출 — 원반이 아니라 넓은 글로우다(ADR-0031 결정 2).
  // 해 위치·세기는 프로토타입 판정값(2026-08-09) — 수평선 높이(y 0)·은은한 글로우(0.15).
  const sunAng = vec2(float(0.2 * sunAlongSign), float(0.0));
  const sunD = length(ang.sub(sunAng));
  const sunGlow = float(1).sub(smoothstep(0.05, 0.55, sunD));

  const skyDay = mix(daySky, color(DAY_CLOUD), cloud).add(
    color(SUN_GLOW).mul(sunGlow.mul(sunGlow).mul(0.15)),
  );
  const skyNight = mix(nightSky, color(NIGHT_CLOUD), cloud.mul(0.75)).add(
    color(STAR_COLOR).mul(star.mul(0.9)),
  );
  const sky = mix(skyDay, skyNight, nightMix);

  // --- 지면: **각도가 아니라 진짜 평면에 투영한다.** 시선이 높이 `GROUND_H_M`의 평면과
  // 만나는 거리는 d = GROUND_H / elev이고(elev < 0), 그 지점의 가로 위치가 P.x + ang.x·d다.
  // 얼룩을 이 미터 좌표로 찍으면 수평선에 가까울수록 무늬가 저절로 압축돼 **면이 깔린 것으로
  // 읽힌다** — 각도 좌표에 찍던 종전 얼룩은 거리에 상관없이 같은 크기라 창밖 절반이 납작한
  // 색면이었다(2026-08-09 "입체감이 없다" 반려).
  const groundDepth = min(float(GROUND_H_M).div(min(elev, float(-0.004))), float(400));
  const groundX = positionLocal.x.add(ang.x.mul(groundDepth));
  // 큰 얼룩(밭·풀밭 단위)과 잔 결. 잔 결은 멀어지면 픽셀보다 촘촘해져 지글거리므로 죽인다.
  const groundPatch = mx_noise_float(vec3(groundX.mul(0.3), groundDepth.mul(0.3), 61.0));
  const groundFine = mx_noise_float(vec3(groundX.mul(1.6), groundDepth.mul(1.6), 67.0)).mul(
    float(1).sub(smoothstep(14.0, 55.0, groundDepth)),
  );
  // **수렴선**: 지면 좌표 x가 일정한 선은 소실점으로 모이고, 깊이가 일정한 선은 수평선에
  // 다가갈수록 촘촘해진다. 이 두 줄무늬가 "면이 멀어진다"를 한눈에 말한다 — 얼룩만으로는
  // 깊이 단서가 없어 히어로에서 아래 절반이 초록 판때기로 보였다(2026-08-09 2차 실측).
  // 주기는 2~3m다 — 9m로 잡았더니 가까운 지면(깊이 5~10m) 한 칸이 창을 통째로 덮어 줄이
  // 하나도 안 보였다(2026-08-09 3차 실측). 멀어지면 픽셀보다 촘촘해지므로 그때는 죽인다.
  const bandFade = float(1).sub(smoothstep(28.0, 80.0, groundDepth));
  const bandX = smoothstep(0.1, 0.5, abs(groundX.div(3.0).fract().sub(0.5)));
  const bandZ = smoothstep(0.08, 0.45, abs(groundDepth.div(2.5).fract().sub(0.5)));
  const grid = bandX.mul(0.1).add(bandZ.mul(0.09)).mul(bandFade).add(0.9);
  // 가까운 지면일수록 어둡다(대기 원근의 짝) — 명도 그라디언트 자체가 거리 단서다.
  const nearDark = mix(float(0.78), float(1.0), smoothstep(3.0, 32.0, groundDepth));
  const groundTone = groundPatch
    .mul(0.34)
    .add(groundFine.mul(0.16))
    .add(0.86)
    .mul(grid)
    .mul(nearDark);
  // 대기 원근 — 먼 지면일수록 수평선 하늘색에 잠긴다. 이 그라디언트가 거리의 두 번째 단서다.
  const groundHaze = smoothstep(35.0, 260.0, groundDepth).mul(0.7);
  const ground = mix(
    mix(color(DAY_GROUND), color(NIGHT_GROUND), nightMix).mul(groundTone),
    mix(color(DAY_HORIZON), color(NIGHT_HORIZON), nightMix),
    groundHaze,
  );
  // **오름차순 smoothstep만 쓴다** — WGSL은 edge0 > edge1이 미정의다. 내림차순으로 쓰면
  // 에러 없이 마스크가 1로 붙어 창밖 전체가 지면색이 된다(실측: 창이 통째로 초록이었다).
  const groundMix = float(1).sub(smoothstep(-0.03, 0.0, elev));
  const backdrop = mix(sky, ground, groundMix);

  // --- 도시 세 겹. 멀리서 가까이 차례로 덮는다 — **앞 층이 뒷 층을 가리는 것**이 원근의
  // 가장 센 단서다. 옥상 높이는 전부 "그 층 깊이로 나눈 값이 가시 고도(tan) 안"이라는 한
  // 규칙으로 잡혀 있다(파일 머리 `SKY_SPAN_TAN` 주석). 가장자리 램프 0.06m는 55m에서
  // 3px이라 옥상선이 또렷하다 — 0.3m로 뭉갰더니 건물이 아니라 얼룩이었다.
  // 건물 높이는 프로토타입의 "건물 높이 배율 0.85"를 구워 넣은 값이다(원 40~95 · 30~75 · 22~52).
  const far = cityLayer(ang, camLocal, FAR_DEPTH_M, 30.0, 34.0, 80.75, 11.0);
  const mid = cityLayer(ang, camLocal, MID_DEPTH_M, 20.0, 25.5, 63.75, 23.0, 0.06);
  const near = cityLayer(ang, camLocal, NEAR_DEPTH_M, 14.0, 18.7, 44.2, 29.0, 0.12);

  const cityFar = layerColor(far, color(CITY_FAR_DAY), color(CITY_FAR_NIGHT), ang.x, 30.0);
  const cityMid = layerColor(mid, color(CITY_MID_DAY), color(CITY_MID_NIGHT), ang.x, 20.0);
  const cityNear = layerColor(near, color(CITY_NEAR_DAY), color(CITY_NEAR_NIGHT), ang.x, 14.0);

  const withFar = mix(backdrop, cityFar, far.mask);
  const withMid = mix(withFar, cityMid, mid.mask);
  const withNear = mix(withMid, cityNear, near.mask);

  // --- 번지는 몫과 안 번지는 몫을 가른다.
  // emissive 슬롯은 블룸 소스이고 문턱이 0이다(강도 1.2·`scene/postfx.ts`) — 창밖을 통째로
  // emissive로 내면 **그림 전체가 1.2배로 흐려져 더해진다**. 그것이 하늘도 건물도 파스텔로
  // 뭉개지던 원인이다("입체감이 없다" 반려). 하늘(과 켜진 창)만 emissive로 보내 과노출로
  // 번지게 하고, 지면·건물은 `colorNode`로 내보내 **또렷하게 남긴다**.
  // 두 몫의 합은 종전 색 그대로다 — 밝기는 안 바뀌고 번짐만 골라 간다.
  const notFar = float(1).sub(far.mask);
  const notMid = float(1).sub(mid.mask);
  const notNear = float(1).sub(near.mask);
  const skyVisible = float(1).sub(groundMix).mul(notFar).mul(notMid).mul(notNear);
  // 켜진 창은 앞 층에 가려지면 안 보인다 — 가림을 그대로 곱한다.
  const litGlow = color(CITY_WINDOW).mul(
    far.lit.mul(notMid).mul(notNear).add(mid.lit.mul(notNear)).add(near.lit).mul(1.6),
  );
  const scale = mix(float(DAY_SCALE), float(NIGHT_SCALE), nightMix);

  return {
    colorNode: withNear.mul(float(1).sub(skyVisible)).mul(scale),
    emissiveNode: withNear.mul(skyVisible).add(litGlow).mul(scale),
  };
}

/**
 * 도시 한 겹 — 깊이 `depthM`의 가상 평면에 세운 계단 실루엣(정면) + **옥상면 투영** + 창 격자
 * + 야간 불빛. (옥상면·파라펫은 2026-08-09 "건물이 2D다" 지적 → 프로토타입 판정으로 확정.)
 *
 * 좌표는 그 층의 미터다: 시선 탄젠트에 깊이를 곱한 것이 가로 위치이고, 높이는 카메라
 * 눈높이를 뺀 값이라 어느 깊이에서도 지면선이 수평선에 온다.
 *
 * **옥상이 보여야 상자로 읽힌다** — 시점이 건물 위(고층)다. 물리 높이 `top`의 지붕 뒷변
 * (깊이 d+D, D = 열 폭 × `ROOF_DEPTH_RATIO`)은 탄젠트가 top/(d+D)라, 층-d 미터 좌표에서는
 * top·d/(d+D)에 온다 — `[top, top·d/(d+D)]` 띠가 화면에 보이는 옥상이다. top이 눈높이
 * 위(+)면 뒷변이 앞변 아래로 내려가 띠 폭이 음수 = 옥상이 안 보인다(물리 그대로, 분기 없음).
 *
 * `gapFrac`만큼의 열은 옥상이 지면 아래로 내려가 **빈 열(골목)**이 된다. 앞 층에 골목이
 * 있어야 그 틈으로 뒷 층과 길이 보인다 — 빈틈 없는 벽은 층이 몇 겹이든 한 장으로 읽힌다.
 * 밑동은 `GROUND_H_M`에서 끊는다 — 안 끊으면 마스크가 창 밑변까지 이어져 지면 층이 통째로
 * 가려진다(야간 켜진 창까지 땅 밑에 박힌다, `lit`이 정면 마스크에 걸려 있다).
 */
function cityLayer(
  ang: unknown,
  camLocal: unknown,
  depthM: number,
  columnWidthM: number,
  minRiseM: number,
  maxRiseM: number,
  seed: number,
  gapFrac = 0,
): {
  x: unknown;
  mask: unknown;
  roofW: unknown;
  parapet: unknown;
  roofClutter: unknown;
  pane: unknown;
  lit: unknown;
} {
  const x = positionLocal.x.add(ang.x.mul(float(depthM)));
  const h = positionLocal.y.add(ang.y.mul(float(depthM))).sub(camLocal.y);
  const rand = columnRandom(x, columnWidthM, seed);
  // 옥상 높이는 **도시 지면에서 잰 실제 건물 높이**다 — 눈높이 기준으로 바꿔 쓴다.
  const top = float(GROUND_H_M + minRiseM)
    .add(rand.mul(float(maxRiseM - minRiseM)))
    .sub(
      float(1)
        .sub(smoothstep(float(gapFrac - 0.06), float(gapFrac), rand))
        .mul(float(maxRiseM + 6)),
    );
  const frontMask = smoothstep(float(GROUND_H_M - 0.25), float(GROUND_H_M), h).mul(
    float(1).sub(smoothstep(0.0, 0.4, h.sub(top))),
  );
  // 옥상 띠 — 뒷변 비 d/(d+D)는 JS 숫자다(깊이·열 폭이 상수라). 램프 0.3m는 파라펫 두께로도 읽힌다.
  const roofBack = top.mul(depthM / (depthM + columnWidthM * ROOF_DEPTH_RATIO));
  const roofMask = clamp(
    smoothstep(top.sub(0.1), top.add(0.3), h).mul(
      float(1).sub(smoothstep(roofBack.sub(0.3), roofBack, h)),
    ),
    0,
    1,
  );
  const mask = max(frontMask, roofMask);
  const roofW = clamp(roofMask.mul(float(1).sub(frontMask)), 0, 1);
  // 파라펫 — 옥상 앞변의 어두운 선. 정면·옥상 경계를 긋는 것이 상자 판독의 반이다.
  const parapet = float(1).sub(smoothstep(0.0, 0.5, abs(h.sub(top))));
  // 옥상 잡동사니 — 물탱크·실외기 자리의 명암 얼룩(열·깊이 좌표 잡음).
  const roofClutter = mx_noise_float(vec3(x.mul(0.7), h.mul(2.2), float(seed).add(41)))
    .mul(0.28)
    .add(0.92);
  // 칸 크기는 실제 창 크기(1.4×1.6m)다 — 층마다 같은 실물 크기라 화면에서는 가까운 층의
  // 격자가 더 크게 보인다. 그 크기 차이 자체가 거리 단서다.
  const paneX = x.div(1.4);
  const paneY = h.div(1.6);
  const pane = min(
    smoothstep(0.0, 0.2, min(paneX.fract(), float(1).sub(paneX.fract()))),
    smoothstep(0.0, 0.24, min(paneY.fract(), float(1).sub(paneY.fract()))),
  );
  // 층 띠 — 창 격자보다 굵고 가로로만 이어져 "몇 층짜리 건물"이 읽힌다.
  const floorBand = smoothstep(0.0, 0.12, min(paneY.fract(), float(1).sub(paneY.fract())));
  const litRand = mx_noise_float(
    vec3(paneX.floor().mul(0.8), paneY.floor().mul(1.4), float(seed).mul(0.7)),
  );
  return {
    x,
    mask,
    roofW,
    parapet,
    roofClutter,
    pane: pane.mul(0.6).add(floorBand.mul(0.4)),
    // 불빛은 **정면에만** — 옥상 띠에 창이 켜지면 지붕에 불이 뜬 걸로 보인다.
    lit: smoothstep(0.3, 0.5, litRand).mul(pane).mul(frontMask).mul(nightMix),
  };
}

/** 한 겹의 색 — 동마다 다른 명도 + 옆면 그늘 + 동 사이 윤곽선 + 주간에도 옅게 보이는 창
 *  격자, 옥상 띠는 하늘을 받아 정면보다 밝고 격자가 없다. 격자가 없으면 크기를 가늠할
 *  단서가 없어 같은 실루엣이 언덕으로도 읽힌다. */
function layerColor(
  layer: { x: unknown; pane: unknown; roofW: unknown; parapet: unknown; roofClutter: unknown },
  dayColor: unknown,
  nightColor: unknown,
  angX: unknown,
  columnWidthM: number,
): unknown {
  const base = mix(dayColor, nightColor, nightMix).mul(columnTone(layer.x, columnWidthM, 5.0));
  // 동 사이 세로 윤곽선 — 인접 동이 같은 명도여도 경계가 끊겨 덩어리가 갈라진다.
  const u = layer.x.div(float(columnWidthM)).fract();
  const edge = float(1)
    .sub(smoothstep(0.015, 0.05, min(u, float(1).sub(u))))
    .mul(EDGE_LINE);
  const front = base
    .mul(sideFaceTone(layer.x, angX, columnWidthM))
    .mul(layer.pane.mul(0.34).add(0.66))
    .mul(float(1).sub(edge));
  const roof = base.mul(1.22).mul(layer.roofClutter);
  return mix(front, roof, layer.roofW).mul(float(1).sub(layer.parapet.mul(0.4)));
}

/** 열 하나에 상수인 0..1 난수. 잡음이 매끈해서 인덱스에 큰 배수를 곱한다 — 작은 배수면
 *  이웃 열이 비슷해져 스카이라인이 아니라 완만한 언덕이 된다. */
function columnRandom(x: unknown, columnWidthM: number, seed: number): unknown {
  return mx_noise_float(vec3(x.div(float(columnWidthM)).floor().mul(4.7), seed, 0.0))
    .mul(0.5)
    .add(0.5);
}

/**
 * 상자로 읽히게 하는 측면 그늘 — 시선 정면에서 벗어난 열일수록 그쪽 **옆면**이 드러난다.
 * 정면(`angX` ≈ 0)의 열은 앞면만 보이므로 그늘이 0이고, 카메라가 돌면 어느 쪽 옆면이
 * 보이는지가 바뀐다. 납작한 색 기둥과 상자를 가르는 것이 이 한 겹이다.
 */
function sideFaceTone(x: unknown, angX: unknown, columnWidthM: number): unknown {
  const u = x.div(float(columnWidthM)).fract();
  const leftFace = float(1).sub(smoothstep(0.0, 0.2, u));
  const rightFace = smoothstep(0.8, 1.0, u);
  // angX > 0이면 그 열은 시선의 오른쪽이라 **왼쪽 옆면**이 보인다(그 반대도 같다).
  const facing = smoothstep(-0.03, 0.03, angX);
  const side = mix(rightFace, leftFace, facing).mul(smoothstep(0.02, 0.18, abs(angX)));
  return float(1).sub(side.mul(SIDE_SHADE));
}

/** 열마다 상수인 명도 배수(0.6..1.35) — 실루엣 덩어리를 여러 동으로 갈라 준다. */
function columnTone(x: unknown, columnWidthM: number, seed: number): unknown {
  return columnRandom(x, columnWidthM, seed).mul(0.75).add(0.6);
}
