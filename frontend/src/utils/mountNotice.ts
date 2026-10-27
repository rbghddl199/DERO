// 결합 이벤트 → 판정 배너 문구 매핑 (D22 3단계). three를 안 끌어오는 순수 모듈이라
// 스토어와 분리돼 있다 — 노드(vitest)에서 그대로 돌릴 수 있어야 한다.

import type { MountEvent } from '@/three/scene/scene';

/** 판정 배너 1건. 화면 라벨은 적합/조건부/불가 — GLOSSARY 정본. */
export interface MountNotice {
  /** 시맨틱 색 — 불가는 레드, 조건부는 앰버 (DESIGN-SYSTEM §1.4). */
  tone: 'reject' | 'warn';
  title: string;
  /** 수치를 포함한 완성 사유 문구 — 엔진이 준 그대로 낸다. */
  reasons: string[];
}

/**
 * 적합 결합은 자석 자체가 피드백이라 배너를 내지 않고(null), 분리도 사용자 조작이라
 * 알릴 것이 없다.
 *
 * `edge-*`(암↔책상)도 D22 ①층 **결합**이다 — Phase 2의 거치(seat)가 아니므로 문구에
 * "거치"를 쓰지 않는다. 이벤트 kind는 채널 내부명일 뿐이다.
 */
export function mountNoticeFor(e: MountEvent): MountNotice | null {
  switch (e.kind) {
    case 'rejected':
    case 'edge-rejected':
      return { tone: 'reject', title: '결합 불가', reasons: e.judgment.reasons };
    case 'mounted':
    case 'edge-snapped':
      return e.judgment.result === 'CONDITIONAL'
        ? { tone: 'warn', title: '조건부 결합', reasons: e.judgment.reasons }
        : null;
    default:
      return null;
  }
}
