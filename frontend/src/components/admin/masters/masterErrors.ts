// 관리자 마스터 화면의 API 오류를 화면에 띄울 한국어 문구로 옮긴다.
// 백엔드가 ProblemDetail.detail에 이미 사람이 읽을 문구를 넣어 주므로(ADR-0008) 그걸 우선 쓰고,
// detail이 비었을 때만 상태 코드별 기본 문구로 떨어진다.

import { ApiError } from '@/api/client';

/**
 * 마스터 6종 삭제는 참조 게이트에 걸리면 409다 — 브랜드·카테고리는 "제품이 참조 중",
 * 카테고리는 "하위 카테고리가 있음"이 따로 있다(CatalogErrorCode).
 */
export const MASTER_CONFLICT_FALLBACK_MESSAGE =
  '다른 데이터가 참조 중이라 삭제할 수 없습니다. 참조를 먼저 정리해 주세요.';

export function toMasterErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiError) {
    const detail = error.problem?.detail;
    if (detail) {
      return detail;
    }
    if (error.status === 409) {
      return MASTER_CONFLICT_FALLBACK_MESSAGE;
    }
    return `${fallbackMessage} (status: ${error.status})`;
  }

  return fallbackMessage;
}
