// 결합 이벤트 → 서버 판정 요청 조립·응답 선택 (ADR-0004 "프론트는 미러, 서버가 정본").
// three를 안 끌어오는 순수 모듈이라 노드(vitest)에서 그대로 돈다 — mountNotice.ts와 같은 결이다.

import type { DeskConfig } from '@/three/core/deskConfig';
import type { MountEvent } from '@/three/scene/scene';
import type {
  JudgmentDeskRequest,
  JudgmentItemRequest,
  JudgmentRequest,
  JudgmentRow,
} from '@/types/compatibility';
import type { MountNotice } from './mountNotice';

/** 씬 아이템 id → 백엔드 `product.id`. 못 푸는 아이템은 null이고 그러면 판정을 요청하지 않는다. */
export type ProductIdResolver = (itemId: string) => number | null;

/**
 * 제품 모드면 `productId`만 싣는다 — 치수를 같이 보내도 서버가 안 읽는다(규격 위조 방지).
 * 직접 입력 모드는 판정이 읽는 규격만 싣는다: 판정 ①의 두께 둘과 판정 ③의 상판 면적 둘.
 *
 * `edgeThicknessMm`의 `undefined`는 `null`로 옮긴다 — 서버에서 그 null은 0이 아니라
 * "상판 두께와 같음"이다(D21). 0으로 옮기면 물림 두께가 조용히 틀어진다.
 */
export function deskRequestFrom(config: DeskConfig): JudgmentDeskRequest {
  if (config.source === 'product') {
    return {
      specSource: 'PRODUCT',
      productId: config.productId ? Number(config.productId) : null,
      widthMm: null,
      depthMm: null,
      topThicknessMm: null,
      edgeThicknessMm: null,
    };
  }
  return {
    specSource: 'CUSTOM',
    productId: null,
    widthMm: config.widthMm,
    depthMm: config.depthMm,
    topThicknessMm: config.topThicknessMm,
    edgeThicknessMm: config.edgeThicknessMm ?? null,
  };
}

/**
 * 결합 시도 1건을 판정 요청으로 옮긴다. 요청에 담는 것은 **그 시도에 관여한 아이템뿐**이다 —
 * 배치 전체 재판정은 저장 시점 서버의 몫이고(ADR-0004), 여기서 다 보내면 배너 하나를 띄우려고
 * 무관한 판정 행을 잔뜩 받는다.
 *
 * `detached`는 사용자 조작이라 알릴 것이 없고, 제품 id를 못 푸는 아이템(GLB 라이브러리 등)은
 * 서버가 해석할 수 없으므로 둘 다 `null`을 낸다 — 호출부는 요청 자체를 보내지 않는다.
 */
export function judgmentRequestFor(
  event: MountEvent,
  desk: JudgmentDeskRequest,
  productIdOf: ProductIdResolver,
): JudgmentRequest | null {
  const items = judgmentItemsFor(event, productIdOf);
  return items === null ? null : { desk, items };
}

// kind를 **긍정으로** 갈라 쓴다 — `detached`를 먼저 걷어내고 나머지를 부정으로 좁히면 TS가
// 유니온 멤버를 못 지운다(멤버 하나의 kind가 두 리터럴의 합집합이라 하나만 빼도 안 사라진다).
function judgmentItemsFor(
  event: MountEvent,
  productIdOf: ProductIdResolver,
): JudgmentItemRequest[] | null {
  // 암↔책상은 상대가 책상이라 아이템이 암 하나다.
  if (event.kind === 'edge-snapped' || event.kind === 'edge-rejected') {
    const armProductId = productIdOf(event.armId);
    if (armProductId == null) return null;
    return [{ ref: event.armId, productId: armProductId, mountedToRef: null }];
  }

  if (event.kind === 'mounted' || event.kind === 'rejected') {
    const armProductId = productIdOf(event.armId);
    const monitorProductId = productIdOf(event.monitorId);
    if (armProductId == null || monitorProductId == null) return null;
    return [
      { ref: event.armId, productId: armProductId, mountedToRef: null },
      { ref: event.monitorId, productId: monitorProductId, mountedToRef: event.armId },
    ];
  }

  return null;
}

/**
 * 응답에서 **이 시도에 해당하는 행**을 고른다. 행이 없으면 `null`이고 그건 불가가 아니라
 * "서버가 그 판정을 수행하지 않았다"는 뜻이다 — `is_clamp_mountable = false`인 암이 그 자리다.
 *
 * 종류로 한 번 더 거르는 이유: 요청에 실린 아이템이 소품으로 해석되면 서버가 `PROP_DESK` 행을
 * 낼 수 있는데, 그건 **거치(seat) 관계**이지 결합이 아니라 결합 배너에 실으면 안 된다.
 */
export function pickMountRow(rows: JudgmentRow[], event: MountEvent): JudgmentRow | null {
  if (event.kind === 'edge-snapped' || event.kind === 'edge-rejected') {
    const armId = event.armId;
    return rows.find((row) => row.kind === 'ARM_DESK' && row.ref === armId) ?? null;
  }
  if (event.kind === 'mounted' || event.kind === 'rejected') {
    const monitorId = event.monitorId;
    return rows.find((row) => row.kind === 'MONITOR_ARM' && row.ref === monitorId) ?? null;
  }
  return null;
}

/**
 * 서버 판정 → 배너. 적합은 자석 자체가 피드백이라 배너를 내지 않고(null), 조건부·불가만 띄운다 —
 * `mountNoticeFor`(미러)와 같은 규약이다.
 *
 * 제목에 "결합"만 쓴다 — 이 경로가 다루는 것은 D22 ①층 결합(암↔책상·모니터↔암)뿐이고
 * **거치(seat)는 형태 페어링이라 판정 어휘를 쓰지 않는다.**
 */
export function serverMountNoticeFor(row: JudgmentRow): MountNotice | null {
  if (row.result === 'INCOMPATIBLE') {
    return { tone: 'reject', title: '결합 불가', reasons: row.reasons };
  }
  if (row.result === 'CONDITIONAL') {
    return { tone: 'warn', title: '조건부 결합', reasons: row.reasons };
  }
  return null;
}
