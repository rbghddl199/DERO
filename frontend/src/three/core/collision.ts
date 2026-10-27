// 호환성 판정 순수 함수 — 규격 DB(mm)만 사용, three·메쉬 치수 참조 금지(D7/D8, NFR-01)
// 공간 겹침 판정은 collider.ts로 이관 (2026-07-21
// 배치·충돌 개선 — 2계층 분리: 호환성=규격 DB, 공간 충돌=시뮬레이터 지오메트리).

import { mmToM } from './units';
import type { ArmSpec, ProductSpec } from '../scene/product';
import type { MonitorSpec } from '../scene/monitor';

/** On-surface footprint area (m^2) from the spec (width x depth). */
export function footprintAreaM2(spec: ProductSpec): number {
  return mmToM(spec.widthMm) * mmToM(spec.depthMm);
}

/** Does an item footprint fit within a surface's top area at all? (D8 ③) */
export function footprintFitsSurface(item: ProductSpec, surface: ProductSpec): boolean {
  return item.widthMm <= surface.widthMm && item.depthMm <= surface.depthMm;
}

// --- 규격 판정 ①·② (REQ-CMP-01·02) -------------------------------------------
// 규칙 정본은 docs/context/compatibility.md. 이 구현은 서버 판정의 **미러**다 —
// 저장 시 WAS가 배치 전체를 다시 판정하고 여기 결과는 읽지 않는다 (ADR-0004).
// 기대 판정은 tests/fixtures/judgment.json(언어 중립)이 TS·Java 양쪽을 묶는다.

/** 저장 코드값 3종 (GLOSSARY 정본). 화면 라벨은 적합/조건부/불가. */
export type JudgmentResult = 'FIT' | 'CONDITIONAL' | 'INCOMPATIBLE';

export interface Judgment {
  result: JudgmentResult;
  /** 수치를 포함한 화면 사유 문구. FIT이면 빈 배열 */
  reasons: string[];
}

const SPEC_MISSING = '미등록 — 제조사 사양 확인 필요';

/** 'WxH' -> 화면 표기 'W×H' (D22 배너 문구) */
function formatVesa(list: string[]): string {
  return list.map((v) => v.replace('x', '×')).join(', ');
}

/** 저장 단위(g)를 표시 단위(kg)로. 3500g는 "3.5kg", 5000g는 "5kg". */
function formatKg(g: number): string {
  return `${g / 1000}kg`;
}

/** 책상 두께 규격 중 판정 ①에 쓰는 부분 — 상판과 (있으면) 엣지 마감. */
export interface DeskGripSpec {
  topThicknessMm: number;
  edgeThicknessMm?: number;
}

/**
 * 클램프가 실제로 무는 두께 (mm) = `max(상판, 엣지 마감)` (D21).
 * 엣지 미등록은 상판 두께로 COALESCE한다(직접 입력 책상 경로).
 * 판정 ①과 씬의 물림 낙차가 **같은 값**을 봐야 하므로 정의는 여기 하나뿐이다.
 */
export function clampGripMm(desk: DeskGripSpec): number {
  const edgeMm =
    typeof desk.edgeThicknessMm === 'number' ? desk.edgeThicknessMm : desk.topThicknessMm;
  return Math.max(desk.topThicknessMm, edgeMm);
}

/**
 * 판정 ① 암↔책상 — 클램프 물림 두께 `max(상판, 엣지 마감)`가 클램프 물림 범위 안인가 (D21).
 * 엣지 미등록은 상판 두께로 COALESCE한다(직접 입력 책상 경로).
 *
 * `isClampMountable=false`인 암은 **판정을 수행하지 않는다** — 불가가 아니라 판정 행이 없다는
 * 뜻으로 `null`을 낸다. 호출부는 이 암에 대한 클램프 판정을 화면에 아예 그리지 않는다.
 */
export function judgeArmDesk(arm: ArmSpec, desk: DeskGripSpec): Judgment | null {
  if (!arm.isClampMountable) return null;

  const min = arm.clampMinMm;
  const max = arm.clampMaxMm;
  // 결측을 0·무한대로 치환하지 않는다 — 각각 전량 불가·전량 적합으로 오판한다.
  if (typeof min !== 'number' || typeof max !== 'number') {
    return { result: 'CONDITIONAL', reasons: [`클램프 물림 규격 ${SPEC_MISSING}`] };
  }

  const gripMm = clampGripMm(desk);
  // 파생값만 내면 "상판은 30인데 왜 불가냐"고 되묻는다 — 어느 쪽에서 나왔는지 함께 낸다.
  const source = gripMm > desk.topThicknessMm ? '엣지 마감' : '상판';

  if (gripMm > max) {
    return {
      result: 'INCOMPATIBLE',
      reasons: [`물림 두께 ${gripMm}mm(${source}) > 클램프 최대 ${max}mm`],
    };
  }
  if (gripMm < min) {
    return {
      result: 'INCOMPATIBLE',
      reasons: [`물림 두께 ${gripMm}mm(${source}) < 클램프 최소 ${min}mm`],
    };
  }
  return { result: 'FIT', reasons: [] };
}

/**
 * 판정 ② 모니터↔암 — VESA 일치 + 무게 vs 허용 하중. 두 축은 독립이라 같이 위반이면 사유도 둘 다 낸다.
 * 한 축이 결측이고 다른 축이 위반이면 INCOMPATIBLE이 이긴다 — 이미 확인된 물리적 불가를
 * "조건부"로 눅이면 결측 방어가 오히려 거짓 통과를 만든다.
 */
export function judgeMonitorArm(monitor: MonitorSpec, arm: ArmSpec): Judgment {
  const violations: string[] = [];
  const missing: string[] = [];

  if (monitor.vesa.length === 0 || arm.vesa.length === 0) {
    missing.push(`VESA 규격 ${SPEC_MISSING}`);
  } else if (!monitor.vesa.some((v) => arm.vesa.includes(v))) {
    violations.push(`VESA ${formatVesa(monitor.vesa)} 불일치`);
  }

  // 비양수(0·음수·NaN)는 미등록으로 본다 — 허용 하중 0인 암은 카탈로그에 없다.
  if (!(monitor.weightG > 0) || !(arm.loadCapacityG > 0)) {
    missing.push(`무게·허용 하중 규격 ${SPEC_MISSING}`);
  } else if (monitor.weightG > arm.loadCapacityG) {
    violations.push(`모니터 ${formatKg(monitor.weightG)} > 허용 ${formatKg(arm.loadCapacityG)}`);
  }

  if (violations.length > 0) {
    return { result: 'INCOMPATIBLE', reasons: [...violations, ...missing] };
  }
  if (missing.length > 0) return { result: 'CONDITIONAL', reasons: missing };
  return { result: 'FIT', reasons: [] };
}
