// ADR-0008 엔벨로프 없는 응답 계약의 공통 타입 — 성공은 리소스 그대로, 실패는 ProblemDetail.

// springdoc은 "이 필드가 null일 수 있는가"를 표현하지 못해 응답 스키마의 전 필드를 optional(`?`)로
// 내보낸다. 하지만 백엔드는 값이 없을 때 키를 빼는 게 아니라 실제로 `null`을 싣는다(Jackson이 null을
// 생략하지 않는다). 그래서 생성 타입에서 응답 타입을 파생할 때는 `?`를 걷어내고, 진짜로 null이 오는
// 필드만 호출부에서 `| null`로 덮는다 — 그러면 "안 왔을 수도 있다"와 "값이 없다"가 한 축으로 정리된다.
// placement.ts·catalog.ts가 같은 규약으로 이 헬퍼를 공유한다.
export type AlwaysPresent<T> = { [K in keyof T]-?: T[K] };

export interface CursorPage<T> {
  content: T[];
  nextCursor: string | null;
  hasNext: boolean;
  /** ADR-0008 결정 5의 2026-07-29 추가분. 무한 스크롤엔 안 쓰지만 "총 N개" 표기가 이걸 읽는다. */
  totalCount: number;
}

export interface ApiFieldError {
  field: string;
  reason: string;
}

export interface ApiProblemDetail {
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors: ApiFieldError[] | null;
}
