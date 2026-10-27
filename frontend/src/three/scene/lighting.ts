// 순수 조명 수학 — 색온도→RGB(흑체 근사) + 빔 각도 + 사용자 밝기·색온도 조절 범위, three 임포트 없음(무드 리그·유닛테스트에서 사용)

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Correlated colour temperature (K) -> sRGB 0..1 (Tanner Helland approximation).
 * Warm (2700K) => R/B >> 1; daylight (6500K) => R ~= B.
 */
export function colorTempToRGB(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return {
    r: clamp01(r / 255),
    g: clamp01(g / 255),
    b: clamp01(b / 255),
  };
}

/** Convenience: warmth ratio R/B (guards divide-by-zero). */
export function warmthRatio(rgb: RGB): number {
  return rgb.r / Math.max(rgb.b, 1e-4);
}

function hexToRGB(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * hex(`'#RRGGBB'`) -> 색온도(K) 근사 역변환. {@link colorTempToRGB}는 닫힌 역함수가 없어
 * warmthRatio(R/B)가 K에 단조 감소한다는 점을 이용해 이분 탐색으로 맞춘다.
 *
 * **슬라이더 초기 위치 전용 근사다** — 정밀 측색이 아니다(ADR-0017 파급 항목: 백엔드
 * `product_emitter.default_color`가 정본이고 프론트 `colorTempK`는 그 파생값).
 */
export function colorTempKFromHex(hex: string): number {
  const target = warmthRatio(hexToRGB(hex));
  let lo = 1000;
  let hi = 40000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const ratio = warmthRatio(colorTempToRGB(mid));
    if (ratio > target) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** Beam half-angle (radians) for a lamp distribution class. */
export function beamHalfAngleRad(distribution: 'spot' | 'flood' | 'ambient'): number {
  switch (distribution) {
    case 'spot':
      return 0.32; // ~18 deg
    case 'flood':
      return 0.7; // ~40 deg
    case 'ambient':
      return 1.4; // ~80 deg
  }
}

/** SpotLight penumbra (0..1) per distribution: 집중형 = crisp edge, 확산형 = soft wide falloff. */
export function penumbraFor(distribution: 'spot' | 'flood' | 'ambient'): number {
  switch (distribution) {
    case 'spot':
      return 0.35;
    case 'flood':
      return 0.65;
    case 'ambient':
      return 0.9;
  }
}

/** Max shadow-casting placed lamps. Room key adds 1 → total caster cap ≤ 3.
 *  슬롯 고정(DERO-235) 이후로는 **캐스터 슬롯 수**다 — 부팅 시 앞쪽 이만큼의
 *  램프 슬롯이 `castShadow = true`로 확정되고 런타임에 절대 바뀌지 않는다. */
export const LAMP_SHADOW_CAP = 2;

/** 부팅 시 미리 만들어 두는 램프 SpotLight 슬롯 수 (DERO-235). 비용 곡선이
 *  3/6/9에서 평평해 여유를 둔 값 — 비싼 건 개수가 아니라 상시 켜진 캐스터 2칸이다
 *  (`frontend/qa-artifacts/light-slots/RESULTS.md` M2). 초과 램프는 빛을 내지 못한다. */
export const LAMP_LIGHT_SLOT_COUNT = 6;

/**
 * 램프 → 슬롯 배정 순서. 반환 배열의 k번째 값이 k번 슬롯에 실을 램프 인덱스다
 * (램프 수가 슬롯 수보다 적으면 그만큼 짧다).
 *
 * 실효 lm 내림차순(223 확정) — 밝은 램프가 캐스터 슬롯(앞 `LAMP_SHADOW_CAP`칸)을
 * 먼저 가진다. 동률은 배치 순서를 지켜야 램프를 하나 더 놓았을 때 이미 놓인 램프의
 * 그림자가 까닭 없이 옮겨 다니지 않는다.
 */
export function lampSlotOrder(lumens: number[]): number[] {
  return lumens.map((_, i) => i).sort((a, b) => lumens[b] - lumens[a] || a - b);
}

// --- 사용자 밝기·색온도 조절 (REQ-SIM-08, DERO-287) --------------------
// 최종 밝기 = 규격 정격 lm × 사용자 배율. 조도(룩스)는 어디에서도 표시하지 않는다.

/** 밝기 배율 하한. **잠정값이다** — 확정은 후속 판정 티켓 소관 (DERO-287). */
export const BRIGHTNESS_SCALE_MIN = 0.5;
/** 밝기 배율 상한. **잠정값이다** — 227 실측에서 600 lm부터 상판 광택 하이라이트가
 *  포화해 사라지는 것이 근거 맥락이고, 정확한 상한은 후속 판정 티켓이 정한다. */
export const BRIGHTNESS_SCALE_MAX = 2.0;
/** 색온도 조절 하한(K) — 전구색 끝단. */
export const COLOR_TEMP_MIN_K = 2700;
/** 색온도 조절 상한(K) — 주광색 끝단. */
export const COLOR_TEMP_MAX_K = 6500;

/**
 * 구간 하나. **두 축에서 쓰이고 둘을 섞으면 안 된다**:
 * - {@link specSpan} — 저작 사양 그대로(K 또는 **lm**). 캡션이 읽고 상태를 판정한다.
 * - {@link clampSpan} — 그 사양을 조절 축(K 또는 **배율**)으로 투영·클램프한 값. 마커 위치만.
 *
 * <p>**읽는 쪽은 세 상태로 갈린다**: 범위형(`min < max`, 띠) · 고정형(`min === max`, 점) ·
 * 미제공(`null`, 마커 없음). 고정형을 위한 별도 타입은 두지 않는다 — 백엔드 `Light`가
 * 조절 불가 제품을 min=max로 저작하는 규약이라 값 자체가 곧 상태다.
 */
export interface MarkerSpan {
  min: number;
  max: number;
}

/** 사용자 배율을 조절 범위로 자른다. 비유한 입력은 호출부(엔진)가 미리 걸러 준다. */
export function clampBrightnessScale(x: number): number {
  return Math.max(BRIGHTNESS_SCALE_MIN, Math.min(BRIGHTNESS_SCALE_MAX, x));
}

/** 사용자 색온도(K)를 조절 범위로 자른다. */
export function clampColorTempK(k: number): number {
  return Math.max(COLOR_TEMP_MIN_K, Math.min(COLOR_TEMP_MAX_K, k));
}

/**
 * **저작 사양 그대로** — 조절 범위로 자르지 않는다. 캡션("이 제품이 어떤 물건인가")이
 * 읽는 값이고, 세 상태(범위형·고정형·미제공)의 **판정 정본**이다.
 *
 * <p>클램프된 마커 span으로 상태를 판정하면 안 된다 — 조절 범위 밖으로 크게 벗어난
 * **범위형** 제품이 클램프 후 한 점으로 뭉개져 "고정형"으로 거짓 표시된다
 * (예: 기준 400lm 제품의 100~200lm 사양 → 배율 0.25~0.5 → 하한에서 잘려 {0.5, 0.5}).
 *
 * <p>값이 하나라도 없으면 null(= 사양 미제공. 백엔드 `Light` 규약이 "모르면 둘 다 NULL").
 * 뒤집힌 입력(min > max)은 정렬해서 받는다 — 카탈로그 오타로 사양이 사라지지 않게.
 */
export function specSpan(min?: number, max?: number): MarkerSpan | null {
  if (min === undefined || max === undefined) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/**
 * 사양 구간을 조절 축 위로 **투영**한다 — 마커 띠·점의 자리를 정하는 값이지 사양 표기가
 * 아니다. 조절 못 하는 자리엔 마커를 그릴 수 없으므로 [lo,hi]로 자른다. 그래서 캡션과
 * 어긋날 수 있고 **그건 오류가 아니라 사실이다** — "제품은 200lm까지 내려가지만 지금
 * 조절 하한은 280lm이다". 상태 판정은 여기가 아니라 {@link specSpan}이 한다.
 *
 * <p>구간이 조절 범위 밖으로 완전히 벗어나면 null이다(그릴 자리가 없다) — 사양 미제공과
 * 화면상 같아지지만, 캡션은 원본을 읽으므로 사양 문구는 여전히 뜬다.
 *
 * <p>경계는 통과한다 — 비교가 strict(`b < lo`·`a > hi`)라 고정값이 lo나 hi에 정확히 놓여도
 * (2700K = `COLOR_TEMP_MIN_K`, 400lm ÷ 400 = 배율 1.0) null로 떨어지지 않는다.
 */
function clampSpan(
  min: number | undefined,
  max: number | undefined,
  lo: number,
  hi: number,
): MarkerSpan | null {
  const spec = specSpan(min, max);
  if (!spec) return null;
  if (spec.max < lo || spec.min > hi) return null;
  return { min: Math.max(spec.min, lo), max: Math.min(spec.max, hi) };
}

/** 색온도 마커 구간(K 축) — 사양 K 범위를 조절 범위로 클램프한 값. */
export function colorTempMarkerSpan(minK?: number, maxK?: number): MarkerSpan | null {
  return clampSpan(minK, maxK, COLOR_TEMP_MIN_K, COLOR_TEMP_MAX_K);
}

/**
 * 밝기 마커 구간(**배율 축**) — 사양 lm 범위를 기준 lm으로 나눠 배율로 옮긴 뒤 클램프한다.
 * 최종 밝기가 `기준 lm × 배율`이므로 사양 구간이 배율 축에서 놓이는 자리가 곧 이 값이다.
 */
export function brightnessMarkerSpan(
  baseLumens: number,
  minLm?: number,
  maxLm?: number,
): MarkerSpan | null {
  if (!Number.isFinite(baseLumens) || baseLumens <= 0) return null;
  if (minLm === undefined || maxLm === undefined) return null;
  return clampSpan(
    minLm / baseLumens,
    maxLm / baseLumens,
    BRIGHTNESS_SCALE_MIN,
    BRIGHTNESS_SCALE_MAX,
  );
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
