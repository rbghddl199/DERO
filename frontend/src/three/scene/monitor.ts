// 모니터 규격 파생 수학 (설계 §2.4·§4.3) — 인치·화면비·곡률에서 mm 치수를
// 계산한다. widthMm/heightMm/depthMm은 저장값이 아니라 여기서 나온 파생값이다.
// NO three import.

/** `'W:H'` — 정수 두 개를 콜론으로 묶은 문자열이면 전부 유효하다(실제 백엔드 aspectWidth/
 *  aspectHeight 조합은 5개 프리셋에 갇히지 않는다, DERO-325). 기존 5개 프리셋 리터럴은
 *  전부 이 패턴을 만족해 하위 호환된다. */
export type AspectRatio = `${number}:${number}`;

export interface MonitorSpec {
  diagonalInch: number;
  aspectRatio: AspectRatio;
  panelShape: 'flat' | 'curved';
  /** curved일 때 곡률 반경 (mm). 예: 1800 = 1800R */
  curvatureRadiusMm?: number;
  /** 화면 둘레 베젤 폭 (mm, 한쪽) */
  bezelMm: number;
  /** 스탠드 발판 깊이 (mm). 제품별 실측값 — 27" 평면 ~130, 34" 커브드 ~230.
   *  패널 처짐이 이보다 작으면 이 값이 제품 depthMm을 지배한다. */
  standDepthMm: number;
  /** 지원 VESA 규격 'WxH' (mm) 목록. 빈 배열 = 미지원·미등록 (ERD product_vesa 정션 = 다대다) */
  vesa: string[];
  /** 무게 (g 정수). ERD monitor.weight_g */
  weightG: number;
  ports: string[];
  resolution?: [number, number];
}

const MM_PER_INCH = 25.4;

/** 'W:H' 문자열을 직접 파싱한다 — 고정 5종 테이블 조회가 아니다(위 AspectRatio 주석 참고). */
export function aspectFraction(ratio: AspectRatio): number {
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
}

/** 대각선 인치 + 화면비 -> 화면(액티브 에어리어) mm 치수. */
export function screenSizeMm(
  diagonalInch: number,
  ratio: AspectRatio,
): { widthMm: number; heightMm: number } {
  const diag = diagonalInch * MM_PER_INCH;
  const a = aspectFraction(ratio);
  const heightMm = diag / Math.hypot(a, 1);
  return { widthMm: heightMm * a, heightMm };
}

/** 베젤을 더한 패널 외형 mm 치수. */
export function panelSizeMm(spec: MonitorSpec): { widthMm: number; heightMm: number } {
  const s = screenSizeMm(spec.diagonalInch, spec.aspectRatio);
  return { widthMm: s.widthMm + spec.bezelMm * 2, heightMm: s.heightMm + spec.bezelMm * 2 };
}

/**
 * 곡면 처짐(sagitta) — 폭 chordMm의 현이 반경 radiusMm 원호를 이룰 때의 깊이.
 * s = R - sqrt(R² - (c/2)²). 현이 지름을 넘으면 R로 포화시켜 NaN을 막는다.
 */
export function curveSagittaMm(chordMm: number, radiusMm: number): number {
  if (!(radiusMm > 0)) return 0;
  if (!(chordMm > 0)) return 0;
  const half = chordMm / 2;
  if (half >= radiusMm) return radiusMm;
  return radiusMm - Math.sqrt(radiusMm * radiusMm - half * half);
}

// --- 파생 외형 치수 (설계 §4.3) ---------------------------------------------
// 패널 두께·스탠드 높이는 제네릭 값(제품별 정밀 재현은 범위 밖). 규격 DB(product.ts)와
// 메쉬 생성부(props.ts)가 같은 상수를 쓰도록 여기서 export한다.
// 스탠드 깊이는 제품별 편차가 커서(27" ~130 vs 34" 커브드 ~230) 전역 상수가 아니라
// MonitorSpec.standDepthMm 필드다.
export const MONITOR_PANEL_THICKNESS_MM = 28;
export const MONITOR_STAND_HEIGHT_MM = 190;

/** 스탠드 발판 폭 (mm). 모니터 폭은 항상 패널 폭이 지배하므로 `monitorDims`에는 안 들어가지만,
 *  발판이 **지지면 판정 입력**이 된 뒤로는 순수 외형 값이 아니다 (ADR-0023 결정 1 개정). */
export const MONITOR_STAND_WIDTH_MM = 200;

/** 스탠드 발판 판 두께 (mm) = 발판 상단의 규격 박스 밑면 기준 높이. */
export const MONITOR_STAND_FOOT_HEIGHT_MM = 14;

/** 모니터가 내놓는 유일한 **지지면** — 스탠드 발판 (ADR-0023 결정 1 개정, DERO-431).
 *
 *  규격 박스 통짜(패널 폭 × 전체 높이)를 지지면으로 쓰면 목 옆 빈 공간까지 박스가 점유해,
 *  27"에서 614×130mm 띠 안에 놓인 것이 전부 상판 +542mm(모니터 꼭대기)로 튄다. 실제로
 *  상판 높이에 있는 것은 이 발판뿐이다. **패널은 지지면을 내놓지 않는다** — 모니터 위에는
 *  아무것도 얹지 않는다(얹고 싶으면 수동 높이, ADR-0023 결정 4).
 *
 *  메쉬를 재지 않는다 — 셋 다 규격·상수 파생이고 `props.ts`의 발판 메쉬가 같은 값을 쓴다. */
export function monitorStandFootMm(m: MonitorSpec): {
  widthMm: number;
  depthMm: number;
  topMm: number;
} {
  return {
    widthMm: MONITOR_STAND_WIDTH_MM,
    depthMm: m.standDepthMm,
    topMm: MONITOR_STAND_FOOT_HEIGHT_MM,
  };
}

/** 규격 -> 제품 외형 mm 치수. 곡면이면 처짐만큼 깊이가 늘어난다. */
export function monitorDims(m: MonitorSpec): {
  widthMm: number;
  depthMm: number;
  heightMm: number;
} {
  const panel = panelSizeMm(m);
  const sag =
    m.panelShape === 'curved' ? curveSagittaMm(panel.widthMm, m.curvatureRadiusMm ?? 0) : 0;
  return {
    widthMm: panel.widthMm,
    depthMm: Math.max(m.standDepthMm, MONITOR_PANEL_THICKNESS_MM + sag),
    heightMm: MONITOR_STAND_HEIGHT_MM + panel.heightMm,
  };
}
