// 안정된 Auth 오류 코드를 side effect 없는 typed failure로 변환한다.

import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/constants/auth/errorCodes';
import type { AuthFailure, AuthFailureCategory, ProblemDetail } from '@/types/auth';

interface AuthFailureOptions {
  message?: string;
  httpStatus?: number | null;
  problem?: ProblemDetail | null;
}

const DEFAULT_MESSAGES: Record<AuthErrorCode, string> = {
  [AUTH_ERROR_CODES.unauthorized]: '인증이 필요합니다.',
  [AUTH_ERROR_CODES.refreshInvalid]: '로그인이 만료되었습니다.',
  [AUTH_ERROR_CODES.sessionRevoked]: '세션이 종료되었습니다.',
  [AUTH_ERROR_CODES.forbidden]: '이 작업을 수행할 권한이 없습니다.',
  [AUTH_ERROR_CODES.contractMismatch]: 'API 오류 응답 계약이 일치하지 않습니다.',
  [AUTH_ERROR_CODES.unclassifiedApiError]: 'API 오류 응답을 확인할 수 없습니다.',
  [AUTH_ERROR_CODES.emailAlreadyRegistered]: '이미 다른 방법으로 가입된 이메일입니다.',
  [AUTH_ERROR_CODES.oauthFailed]: '소셜 로그인에 실패했습니다. 다시 시도해 주세요.',
};

function categoryFor(code: AuthErrorCode): AuthFailureCategory {
  switch (code) {
    case AUTH_ERROR_CODES.unauthorized:
    case AUTH_ERROR_CODES.refreshInvalid:
    case AUTH_ERROR_CODES.sessionRevoked:
      return 'authentication';
    case AUTH_ERROR_CODES.forbidden:
      return 'authorization';
    case AUTH_ERROR_CODES.contractMismatch:
      return 'contract';
    case AUTH_ERROR_CODES.emailAlreadyRegistered:
    case AUTH_ERROR_CODES.oauthFailed:
      return 'authentication';
    case AUTH_ERROR_CODES.unclassifiedApiError:
      return 'unknown';
  }
}

export function createAuthFailure(
  code: AuthErrorCode,
  options: AuthFailureOptions = {},
): AuthFailure {
  return {
    code,
    category: categoryFor(code),
    message: options.message ?? DEFAULT_MESSAGES[code],
    httpStatus: options.httpStatus ?? null,
    problem: options.problem ?? null,
  };
}
