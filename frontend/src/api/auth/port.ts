// OAuth protocol을 재구현하지 않는 Auth Adapter capability boundary를 정의한다.

import type {
  AuthFailure,
  AuthProvider,
  AuthResult,
  ProvisionalAuthorizationOutcome,
  UserSession,
} from '@/types/auth';

export interface AuthAdapter {
  authorize(provider: AuthProvider): Promise<AuthResult<ProvisionalAuthorizationOutcome>>;
  bootstrap(): Promise<AuthResult<UserSession>>;
  currentSession(): Promise<AuthResult<UserSession | null>>;
  refresh(): Promise<AuthResult<UserSession>>;
  logout(): Promise<AuthResult<void>>;
}

export function authSuccess<T>(data: T): AuthResult<T> {
  return { ok: true, data };
}

export function authFailure<T>(failure: AuthFailure): AuthResult<T> {
  return { ok: false, failure };
}
