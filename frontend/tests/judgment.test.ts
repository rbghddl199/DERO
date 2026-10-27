// 호환성 판정 ①·② 계약 테스트 — 언어 중립 fixture(tests/fixtures/judgment.json)를 그대로
// 소비한다. Java(JUnit)가 같은 파일을 소비하므로 규칙이 갈리면 한쪽이 그날 깨진다 (ADR-0004).

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  judgeArmDesk,
  judgeMonitorArm,
  type Judgment,
  type JudgmentResult,
} from '../src/three/core/collision';
import { getProduct, type ArmSpec } from '../src/three/scene/product';
import type { MonitorSpec } from '../src/three/scene/monitor';

interface ExpectedJudgment {
  result: JudgmentResult;
  reasonCount: number;
  reasonContains: string[];
}

interface ArmDeskCase {
  name: string;
  arm: { isClampMountable: boolean; clampMinMm: number | null; clampMaxMm: number | null };
  desk: { topThicknessMm: number; edgeThicknessMm: number | null };
  /** null = 판정 행 없음 */
  expected: ExpectedJudgment | null;
}

interface MonitorArmCase {
  name: string;
  monitor: { vesa: string[]; weightG: number | null };
  arm: { vesa: string[]; loadCapacityG: number | null };
  expected: ExpectedJudgment;
}

interface JudgmentFixtures {
  armDesk: ArmDeskCase[];
  monitorArm: MonitorArmCase[];
}

const fixtures: JudgmentFixtures = JSON.parse(
  readFileSync(new URL('./fixtures/judgment.json', import.meta.url), 'utf8'),
);

/** fixture의 null(DB NULL) -> TS 옵셔널/비양수. 판정이 읽지 않는 축은 빈 값으로 채운다. */
function armFromClampFixture(c: ArmDeskCase['arm']): ArmSpec {
  return {
    vesa: [],
    loadCapacityG: 0,
    isClampMountable: c.isClampMountable,
    clampMinMm: c.clampMinMm ?? undefined,
    clampMaxMm: c.clampMaxMm ?? undefined,
  };
}

/** 판정 ②가 읽는 것은 vesa·weightG뿐 — 외형 파생 필드는 고정 더미다 (D7 규격 전용). */
function monitorFromFixture(m: MonitorArmCase['monitor']): MonitorSpec {
  return {
    diagonalInch: 27,
    aspectRatio: '16:9',
    panelShape: 'flat',
    bezelMm: 8,
    standDepthMm: 130,
    vesa: m.vesa,
    weightG: m.weightG ?? 0,
    ports: [],
    resolution: [2560, 1440],
  };
}

function armFromMountFixture(a: MonitorArmCase['arm']): ArmSpec {
  return {
    vesa: a.vesa,
    loadCapacityG: a.loadCapacityG ?? 0,
    isClampMountable: true,
  };
}

function expectJudgment(actual: Judgment, expected: ExpectedJudgment): void {
  expect(actual.result).toBe(expected.result);
  expect(actual.reasons).toHaveLength(expected.reasonCount);
  const joined = actual.reasons.join(' | ');
  for (const needle of expected.reasonContains) {
    expect(joined).toContain(needle);
  }
}

describe('fixture 계약 — 판정 ① 암↔책상', () => {
  it('fixture가 비어 있지 않다 (경로가 어긋나면 전 케이스가 조용히 통과한다)', () => {
    expect(fixtures.armDesk.length).toBeGreaterThan(0);
  });

  for (const c of fixtures.armDesk) {
    it(c.name, () => {
      const actual = judgeArmDesk(armFromClampFixture(c.arm), {
        topThicknessMm: c.desk.topThicknessMm,
        edgeThicknessMm: c.desk.edgeThicknessMm ?? undefined,
      });
      if (c.expected === null) {
        expect(actual).toBeNull();
        return;
      }
      expect(actual).not.toBeNull();
      expectJudgment(actual!, c.expected);
    });
  }
});

describe('fixture 계약 — 판정 ② 모니터↔암', () => {
  it('fixture가 비어 있지 않다', () => {
    expect(fixtures.monitorArm.length).toBeGreaterThan(0);
  });

  for (const c of fixtures.monitorArm) {
    it(c.name, () => {
      const actual = judgeMonitorArm(monitorFromFixture(c.monitor), armFromMountFixture(c.arm));
      expectJudgment(actual, c.expected);
    });
  }
});

// 문구 전문은 화면 표기라 언어 중립 fixture에 담지 않는다 — 여기서만 고정한다.
describe('사유 문구 (compatibility.md·D22 예시)', () => {
  const clampArm: ArmSpec = {
    vesa: ['100x100'],
    loadCapacityG: 5000,
    isClampMountable: true,
    clampMinMm: 10,
    clampMaxMm: 35,
  };

  it('물림 두께 초과 사유에 파생값과 출처(엣지 마감)를 병기한다', () => {
    const j = judgeArmDesk(clampArm, { topThicknessMm: 18, edgeThicknessMm: 40 })!;
    expect(j.reasons).toEqual(['물림 두께 40mm(엣지 마감) > 클램프 최대 35mm']);
  });

  it('물림 두께가 상판에서 나오면 출처가 상판이다', () => {
    const j = judgeArmDesk(clampArm, { topThicknessMm: 8, edgeThicknessMm: 6 })!;
    expect(j.reasons).toEqual(['물림 두께 8mm(상판) < 클램프 최소 10mm']);
  });

  it('클램프 물림 규격 미등록 문구', () => {
    const j = judgeArmDesk(
      { vesa: [], loadCapacityG: 5000, isClampMountable: true },
      { topThicknessMm: 25 },
    )!;
    expect(j.reasons).toEqual(['클램프 물림 규격 미등록 — 제조사 사양 확인 필요']);
  });

  it('VESA 불일치·하중 초과 문구 (D22 배너)', () => {
    const monitor = monitorFromFixture({ vesa: ['75x75'], weightG: 7100 });
    const arm = armFromMountFixture({ vesa: ['100x100'], loadCapacityG: 5000 });
    const j = judgeMonitorArm(monitor, arm);
    expect(j.reasons).toEqual(['VESA 75×75 불일치', '모니터 7.1kg > 허용 5kg']);
  });
});

describe('카탈로그 실데이터 스모크', () => {
  const arm = getProduct('monitor-arm-white')!.arm!;

  it('27인치 + 데모 암 = 적합', () => {
    const m = getProduct('monitor-27')!.monitor!;
    expect(judgeMonitorArm(m, arm)).toEqual({ result: 'FIT', reasons: [] });
  });

  it('34인치 커브드(7.1kg) + 데모 암(허용 5kg) = 불가', () => {
    const m = getProduct('monitor-34-curved')!.monitor!;
    const j = judgeMonitorArm(m, arm);
    expect(j.result).toBe('INCOMPATIBLE');
    expect(j.reasons).toEqual(['모니터 7.1kg > 허용 5kg']);
  });

  it('데모 암 + 오크 1200(상판 25/엣지 25) = 적합', () => {
    const d = getProduct('desk-oak-1200')!;
    const j = judgeArmDesk(arm, {
      topThicknessMm: d.topThicknessMm!,
      edgeThicknessMm: d.edgeThicknessMm,
    })!;
    expect(j).toEqual({ result: 'FIT', reasons: [] });
  });

  it('데모 암 + 월넛 1400(상판 30/엣지 45) = 불가 — 상판만 보면 적합인 자리 (D21)', () => {
    const d = getProduct('desk-walnut-1400')!;
    const j = judgeArmDesk(arm, {
      topThicknessMm: d.topThicknessMm!,
      edgeThicknessMm: d.edgeThicknessMm,
    })!;
    expect(j.result).toBe('INCOMPATIBLE');
    expect(j.reasons).toEqual(['물림 두께 45mm(엣지 마감) > 클램프 최대 40mm']);
    // 상판 두께 단독이었다면 통과했을 조합임을 함께 못박는다.
    expect(d.topThicknessMm!).toBeLessThanOrEqual(arm.clampMaxMm!);
  });
});
