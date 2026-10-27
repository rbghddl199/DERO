// 결합 이벤트 → 서버 판정 요청 조립·응답 선택 (ADR-0004 미러/정본 배선).
// 판정 **규칙** 자체는 여기서 세우지 않는다 — 그건 judgment.test.ts(공유 fixture 계약)의 몫이고,
// 여기가 지는 것은 "무엇을 물어보고 무엇을 화면에 올리나"다.

import { describe, it, expect } from 'vitest';
import {
  deskRequestFrom,
  judgmentRequestFor,
  pickMountRow,
  serverMountNoticeFor,
} from '../src/utils/serverJudgment';
import type { DeskConfig } from '../src/three/core/deskConfig';
import type { MountEvent } from '../src/three/scene/scene';
import type { JudgmentRow } from '../src/types/compatibility';

const CUSTOM_DESK: DeskConfig = {
  source: 'custom',
  widthMm: 1400,
  depthMm: 700,
  heightMm: 720,
  topThicknessMm: 25,
  materialId: 'oak',
  frameType: 'four-leg',
};

const FIT = { result: 'FIT', reasons: [] } as const;
const productIdOf = (itemId: string): number | null =>
  itemId.startsWith('arm') ? 11 : itemId.startsWith('mon') ? 22 : null;

describe('deskRequestFrom', () => {
  it('제품 모드는 productId만 싣는다 — 치수를 보내면 규격 위조가 성립한다', () => {
    const request = deskRequestFrom({ ...CUSTOM_DESK, source: 'product', productId: '102' });

    expect(request).toEqual({
      specSource: 'PRODUCT',
      productId: 102,
      widthMm: null,
      depthMm: null,
      topThicknessMm: null,
      edgeThicknessMm: null,
    });
  });

  it('엣지 미등록은 0이 아니라 null로 보낸다 (D21 — 서버가 상판 두께로 COALESCE한다)', () => {
    expect(deskRequestFrom(CUSTOM_DESK).edgeThicknessMm).toBeNull();
  });

  it('엣지를 입력했으면 그 값을 그대로 싣는다', () => {
    expect(deskRequestFrom({ ...CUSTOM_DESK, edgeThicknessMm: 45 }).edgeThicknessMm).toBe(45);
  });
});

describe('judgmentRequestFor', () => {
  const desk = deskRequestFrom(CUSTOM_DESK);

  it('암↔책상은 암 하나만 싣는다 — 상대가 책상이라 아이템이 더 필요 없다', () => {
    const event: MountEvent = { kind: 'edge-snapped', armId: 'arm-1', judgment: FIT };

    expect(judgmentRequestFor(event, desk, productIdOf)?.items).toEqual([
      { ref: 'arm-1', productId: 11, mountedToRef: null },
    ]);
  });

  it('모니터↔암은 암을 먼저 싣고 모니터가 그 ref를 가리킨다', () => {
    const event: MountEvent = {
      kind: 'mounted',
      monitorId: 'mon-1',
      armId: 'arm-1',
      judgment: FIT,
    };

    expect(judgmentRequestFor(event, desk, productIdOf)?.items).toEqual([
      { ref: 'arm-1', productId: 11, mountedToRef: null },
      { ref: 'mon-1', productId: 22, mountedToRef: 'arm-1' },
    ]);
  });

  it('시도에 관여하지 않은 아이템은 안 싣는다 — 배치 전체 재판정은 저장 시점 서버의 몫이다', () => {
    const event: MountEvent = {
      kind: 'rejected',
      monitorId: 'mon-1',
      armId: 'arm-1',
      judgment: FIT,
    };

    expect(judgmentRequestFor(event, desk, productIdOf)?.items).toHaveLength(2);
  });

  it('분리는 요청하지 않는다 — 사용자 조작이라 알릴 것이 없다', () => {
    const event: MountEvent = { kind: 'detached', monitorId: 'mon-1', armId: 'arm-1' };

    expect(judgmentRequestFor(event, desk, productIdOf)).toBeNull();
  });

  it('백엔드 제품 id를 못 푸는 아이템이 있으면 요청 자체를 만들지 않는다', () => {
    const event: MountEvent = { kind: 'edge-snapped', armId: 'glb-library-item', judgment: FIT };

    expect(judgmentRequestFor(event, desk, productIdOf)).toBeNull();
  });
});

describe('pickMountRow', () => {
  const rows: JudgmentRow[] = [
    { kind: 'ARM_DESK', ref: 'arm-1', targetRef: null, result: 'FIT', reasons: [] },
    {
      kind: 'MONITOR_ARM',
      ref: 'mon-1',
      targetRef: 'arm-1',
      result: 'INCOMPATIBLE',
      reasons: ['모니터 7.1kg > 허용 5kg'],
    },
  ];

  it('암↔책상 시도는 ARM_DESK 행을 고른다', () => {
    const event: MountEvent = { kind: 'edge-rejected', armId: 'arm-1', judgment: FIT };

    expect(pickMountRow(rows, event)?.kind).toBe('ARM_DESK');
  });

  it('모니터↔암 시도는 그 모니터의 MONITOR_ARM 행을 고른다', () => {
    const event: MountEvent = {
      kind: 'mounted',
      monitorId: 'mon-1',
      armId: 'arm-1',
      judgment: FIT,
    };

    expect(pickMountRow(rows, event)?.reasons).toEqual(['모니터 7.1kg > 허용 5kg']);
  });

  it('행이 없으면 null이다 — 불가가 아니라 "판정을 수행하지 않았다"다', () => {
    const event: MountEvent = { kind: 'edge-snapped', armId: 'arm-clamp-불가', judgment: FIT };

    expect(pickMountRow(rows, event)).toBeNull();
  });

  it('PROP_DESK 행을 결합 배너로 끌어오지 않는다 — 거치는 판정 어휘를 쓰지 않는다', () => {
    const propRows: JudgmentRow[] = [
      { kind: 'PROP_DESK', ref: 'arm-1', targetRef: null, result: 'INCOMPATIBLE', reasons: ['x'] },
    ];
    const event: MountEvent = { kind: 'edge-snapped', armId: 'arm-1', judgment: FIT };

    expect(pickMountRow(propRows, event)).toBeNull();
  });
});

describe('serverMountNoticeFor', () => {
  it('불가는 레드 배너에 근거 수치를 그대로 싣는다', () => {
    const row: JudgmentRow = {
      kind: 'ARM_DESK',
      ref: 'arm-1',
      targetRef: null,
      result: 'INCOMPATIBLE',
      reasons: ['물림 두께 45mm(엣지 마감) > 클램프 최대 40mm'],
    };

    expect(serverMountNoticeFor(row)).toEqual({
      tone: 'reject',
      title: '결합 불가',
      reasons: ['물림 두께 45mm(엣지 마감) > 클램프 최대 40mm'],
    });
  });

  it('조건부는 앰버 배너에 미등록 사유를 싣는다', () => {
    const row: JudgmentRow = {
      kind: 'ARM_DESK',
      ref: 'arm-1',
      targetRef: null,
      result: 'CONDITIONAL',
      reasons: ['클램프 물림 규격 미등록 — 제조사 사양 확인 필요'],
    };

    expect(serverMountNoticeFor(row)?.tone).toBe('warn');
    expect(serverMountNoticeFor(row)?.title).toBe('조건부 결합');
  });

  it('적합은 배너를 내지 않는다 — 자석 자체가 피드백이다', () => {
    const row: JudgmentRow = {
      kind: 'MONITOR_ARM',
      ref: 'mon-1',
      targetRef: 'arm-1',
      result: 'FIT',
      reasons: [],
    };

    expect(serverMountNoticeFor(row)).toBeNull();
  });
});
