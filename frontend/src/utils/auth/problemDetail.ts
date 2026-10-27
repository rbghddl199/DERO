// ADR-0008 ProblemDetail을 검증하고 Auth side effect용 typed failure로 매핑한다.

import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { AuthFailure, AuthResult, ProblemDetail } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';
import { isRecord, parseApiProblemDetail } from '@/utils/problemDetail';

function malformedProblemFailure(): AuthFailure {
  return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError);
}

export function parseProblemDetail(value: unknown): AuthResult<ProblemDetail> {
  const parsed = parseApiProblemDetail(value);
  if (!parsed) {
    return { ok: false, failure: malformedProblemFailure() };
  }

  // Spring ProblemDetail은 type이 기본값 about:blank면 바디에서 필드 자체를 생략한다
  // (backend/dero-api ProblemDetails.java 참고) — 없으면 그 기본값으로 채운다.
  const rawType = isRecord(value) ? value.type : undefined;
  const type = rawType === undefined ? 'about:blank' : rawType;
  if (typeof type !== 'string') {
    return { ok: false, failure: malformedProblemFailure() };
  }

  return { ok: true, data: { ...parsed, type } };
}

function contractMismatch(problem: ProblemDetail, httpStatus: number): AuthFailure {
  return createAuthFailure(AUTH_ERROR_CODES.contractMismatch, {
    httpStatus,
    problem,
  });
}

export function mapAuthProblemDetail(value: unknown, httpStatus: number): AuthFailure {
  const parsed = parseProblemDetail(value);
  if (!parsed.ok) {
    return parsed.failure;
  }

  const problem = parsed.data;
  if (problem.status !== httpStatus) {
    return contractMismatch(problem, httpStatus);
  }

  switch (problem.code) {
    case AUTH_ERROR_CODES.unauthorized:
      return httpStatus === 401
        ? createAuthFailure(AUTH_ERROR_CODES.unauthorized, {
            message: problem.detail,
            httpStatus,
            problem,
          })
        : contractMismatch(problem, httpStatus);
    case AUTH_ERROR_CODES.refreshInvalid:
      return httpStatus === 401
        ? createAuthFailure(AUTH_ERROR_CODES.refreshInvalid, {
            message: problem.detail,
            httpStatus,
            problem,
          })
        : contractMismatch(problem, httpStatus);
    case AUTH_ERROR_CODES.sessionRevoked:
      return httpStatus === 401
        ? createAuthFailure(AUTH_ERROR_CODES.sessionRevoked, {
            message: problem.detail,
            httpStatus,
            problem,
          })
        : contractMismatch(problem, httpStatus);
    case AUTH_ERROR_CODES.forbidden:
      return httpStatus === 403
        ? createAuthFailure(AUTH_ERROR_CODES.forbidden, {
            message: problem.detail,
            httpStatus,
            problem,
          })
        : contractMismatch(problem, httpStatus);
    default:
      return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError, {
        message: problem.detail,
        httpStatus,
        problem,
      });
  }
}
