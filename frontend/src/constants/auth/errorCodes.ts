// Auth 전송·계약 계층이 공유하는 안정된 오류 코드를 정의한다.

export const AUTH_ERROR_CODES = {
  unauthorized: 'AUTH_UNAUTHORIZED',
  refreshInvalid: 'AUTH_REFRESH_INVALID',
  sessionRevoked: 'AUTH_SESSION_REVOKED',
  forbidden: 'AUTH_FORBIDDEN',
  contractMismatch: 'AUTH_CONTRACT_MISMATCH',
  unclassifiedApiError: 'UNCLASSIFIED_API_ERROR',
  // 소셜 로그인 콜백의 ?error= 쿼리파라미터로만 온다(ProblemDetail이 아니다) — AuthErrorCode.java 참고.
  emailAlreadyRegistered: 'AUTH_EMAIL_ALREADY_REGISTERED',
  oauthFailed: 'AUTH_OAUTH_FAILED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
