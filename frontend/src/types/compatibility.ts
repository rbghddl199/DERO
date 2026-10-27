// 호환성 판정(Compatibility) 도메인 와이어 타입 — POST /api/v1/compatibility/judgments (api-spec.md §8)
//
// **손으로 썼다.** 다른 도메인처럼 src/types/openapi.d.ts에서 파생해야 하지만, 그 파일은 백엔드가
// local 프로파일로 떠 있을 때만 `npm run api:types`로 재생성된다 — 이 엔드포인트가 develop에 머지되고
// 나면 재생성한 뒤 아래 정의를 생성 타입 파생으로 갈아치울 것(DERO-338).

/** 저장 코드값 3종 — GLOSSARY 정본. 화면 라벨은 적합/조건부/불가. */
export type JudgmentResult = 'FIT' | 'CONDITIONAL' | 'INCOMPATIBLE';

/** 판정 3종. ①/②/③ 순서다. */
export type JudgmentKind = 'ARM_DESK' | 'MONITOR_ARM' | 'PROP_DESK';

/** 책상 쪽 입력 — D18 배타적 2모드. PRODUCT면 서버가 카탈로그 규격을 읽고 아래 치수는 무시한다. */
export interface JudgmentDeskRequest {
  specSource: 'PRODUCT' | 'CUSTOM';
  productId: number | null;
  widthMm: number | null;
  depthMm: number | null;
  topThicknessMm: number | null;
  /** null은 0이 아니라 "상판 두께와 같음"이다 (D21) */
  edgeThicknessMm: number | null;
}

/**
 * 판정할 아이템 1개. 좌표·회전을 안 싣는다 — 규격 판정의 입력이 아니고, 공간 겹침은
 * `collider.ts`가 로컬에서 본다(D7/D8).
 *
 * 판정 결과를 실어 보내는 필드가 없는 것은 의도다 — 서버가 정본이라 클라이언트 판정을
 * 신뢰하지도 저장하지도 않는다(ADR-0004). 넣어도 서버가 버린다.
 */
export interface JudgmentItemRequest {
  ref: string;
  productId: number;
  mountedToRef: string | null;
}

export interface JudgmentRequest {
  desk: JudgmentDeskRequest;
  items: JudgmentItemRequest[];
}

/**
 * 판정 1행. **수행한 판정만 실려 온다** — `is_clamp_mountable = false`인 암은 ARM_DESK 행이
 * 아예 없다("불가"가 아니다). 행이 없는 것을 불가로 읽지 말 것.
 */
export interface JudgmentRow {
  kind: JudgmentKind;
  ref: string;
  targetRef: string | null;
  result: JudgmentResult;
  /** 근거 수치가 든 완성 문구. FIT이면 빈 배열 */
  reasons: string[];
}

export interface JudgmentResponse {
  judgments: JudgmentRow[];
}
