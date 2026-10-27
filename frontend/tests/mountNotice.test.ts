// 결합 이벤트 → 판정 배너 문구 매핑 회귀 테스트 (D22 3단계).
// 핵심은 어휘다: 암↔책상(edge-*)도 ①층 **결합**이라 "거치"로 부르면 안 되고,
// 적합 결합은 자석 자체가 피드백이라 배너를 내지 않는다.
import { describe, it, expect } from 'vitest';
import { mountNoticeFor } from '../src/utils/mountNotice';
import type { MountEvent } from '../src/three/scene/scene';

const FIT = { result: 'FIT' as const, reasons: [] };
const CONDITIONAL = {
  result: 'CONDITIONAL' as const,
  reasons: ['클램프 물림 규격 미등록 — 제조사 사양 확인 필요'],
};
const INCOMPATIBLE = {
  result: 'INCOMPATIBLE' as const,
  reasons: ['모니터 7.1kg > 허용 5kg'],
};

describe('mountNoticeFor', () => {
  it('모니터↔암 불가는 레드 "결합 불가" + 수치 사유를 그대로 낸다', () => {
    const e: MountEvent = {
      kind: 'rejected',
      monitorId: 'p1',
      armId: 'p2',
      judgment: INCOMPATIBLE,
    };
    expect(mountNoticeFor(e)).toEqual({
      tone: 'reject',
      title: '결합 불가',
      reasons: ['모니터 7.1kg > 허용 5kg'],
    });
  });

  it('암↔책상 불가도 "결합 불가" — "거치"는 Phase 2의 별개 층이라 쓰지 않는다', () => {
    const e: MountEvent = { kind: 'edge-rejected', armId: 'p2', judgment: INCOMPATIBLE };
    const n = mountNoticeFor(e)!;
    expect(n.title).toBe('결합 불가');
    expect(n.title).not.toContain('거치');
    expect(n.tone).toBe('reject');
  });

  it('조건부 결합은 앰버 "조건부 결합" + 사유', () => {
    const e: MountEvent = { kind: 'mounted', monitorId: 'p1', armId: 'p2', judgment: CONDITIONAL };
    expect(mountNoticeFor(e)).toEqual({
      tone: 'warn',
      title: '조건부 결합',
      reasons: CONDITIONAL.reasons,
    });
  });

  it('조건부 엣지 스냅도 같은 어휘를 쓴다', () => {
    const e: MountEvent = { kind: 'edge-snapped', armId: 'p2', judgment: CONDITIONAL };
    const n = mountNoticeFor(e)!;
    expect(n.title).toBe('조건부 결합');
    expect(n.tone).toBe('warn');
  });

  it('적합 결합·적합 엣지 스냅은 배너가 없다 — 자석이 곧 피드백', () => {
    expect(
      mountNoticeFor({ kind: 'mounted', monitorId: 'p1', armId: 'p2', judgment: FIT }),
    ).toBeNull();
    expect(mountNoticeFor({ kind: 'edge-snapped', armId: 'p2', judgment: FIT })).toBeNull();
  });

  it('분리는 판정이 아니라 사용자 조작이라 알릴 것이 없다', () => {
    expect(mountNoticeFor({ kind: 'detached', monitorId: 'p1', armId: 'p2' })).toBeNull();
  });
});
