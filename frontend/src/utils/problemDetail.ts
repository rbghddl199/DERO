// ADR-0008 ProblemDetail 형태 검증 — 도메인 공통. auth(src/utils/auth/problemDetail.ts)는
// 이 위에 `type` 필드 기본값 처리만 얹어 자체 ProblemDetail을 만든다.

import type { ApiFieldError, ApiProblemDetail } from '@/types/api';

const STABLE_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFieldErrors(value: unknown): ApiFieldError[] | null | undefined {
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const errors: ApiFieldError[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.field !== 'string' || typeof entry.reason !== 'string') {
      return undefined;
    }
    errors.push({ field: entry.field, reason: entry.reason });
  }
  return errors;
}

/**
 * 형태가 RFC9457 ProblemDetail(+`code` 확장)과 맞지 않으면 null.
 *
 * `errors` 키가 **아예 없는 것은 정상**이다 — 백엔드 `ProblemDetails.of`는 `code`와 `instance`만
 * 싣고, `errors`는 `GlobalExceptionHandler`가 검증 실패(Bean Validation·타입 불일치)에서만 얹는다.
 * 즉 401·403·404·409 바디에는 이 키가 없다. 필수로 요구하면 그 응답들이 전부 null로 떨어져
 * `ApiError.problem`이 비고, 한국어 `detail`과 프론트가 분기할 `code`가 같이 사라진다
 * (실제로 401 자동 회전이 `AUTH_SESSION_REVOKED`를 평범한 만료로 오분류했다 — 2026-08-01).
 * 키가 있는데 배열도 null도 아닌 경우는 계속 fail-closed다.
 */
export function parseApiProblemDetail(value: unknown): ApiProblemDetail | null {
  if (!isRecord(value)) {
    return null;
  }

  const errors = Object.prototype.hasOwnProperty.call(value, 'errors')
    ? parseFieldErrors(value.errors)
    : null;
  if (
    typeof value.title !== 'string' ||
    !Number.isInteger(value.status) ||
    typeof value.status !== 'number' ||
    value.status < 100 ||
    value.status > 599 ||
    typeof value.detail !== 'string' ||
    typeof value.instance !== 'string' ||
    typeof value.code !== 'string' ||
    !STABLE_CODE_PATTERN.test(value.code) ||
    errors === undefined
  ) {
    return null;
  }

  return {
    title: value.title,
    status: value.status,
    detail: value.detail,
    instance: value.instance,
    code: value.code,
    errors,
  };
}
