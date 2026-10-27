// canonical Auth 상태·세션과 provisional Adapter 결과 타입을 정의한다.

import type { AuthErrorCode } from '@/constants/auth/errorCodes';

export type AuthProvider = 'google' | 'kakao';

// 백엔드 UserMeResponse.role(USER|ADMIN)의 소문자 대응 — provider와 같은 표기 관례다.
export type UserRole = 'user' | 'admin';

export type AuthStatus = 'unknown' | 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface UserSession {
  userId: string;
  provider: AuthProvider;
  role: UserRole;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: 'active';
  // 백엔드 UserMeResponse.onboardingRequired의 파생값 — 프론트는 이 값 하나만 보고 온보딩으로
  // 보낸다(api-spec.md §3). 별도 온보딩 상태 조회 엔드포인트는 없다.
  onboardingRequired: boolean;
  // 백엔드 UserMeResponse.createdAt(BaseEntity 감사 필드) 그대로 — 마이페이지 가입일 표시용.
  joinedAt: string;
}

export interface FieldError {
  field: string;
  reason: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  errors: FieldError[] | null;
}

export type AuthFailureCategory = 'authentication' | 'authorization' | 'contract' | 'unknown';

export interface AuthFailure {
  code: AuthErrorCode;
  category: AuthFailureCategory;
  message: string;
  httpStatus: number | null;
  problem: ProblemDetail | null;
}

export type AuthResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      failure: AuthFailure;
    };

export type ProvisionalAuthorizationOutcome =
  | {
      kind: 'success';
      session: UserSession;
    }
  | {
      kind: 'cancel';
    };

export interface AuthUnknownState {
  status: 'unknown';
  session: null;
  failure: null;
}

export interface AuthLoadingState {
  status: 'loading';
  session: UserSession | null;
  failure: null;
}

export interface AuthAnonymousState {
  status: 'anonymous';
  session: null;
  failure: AuthFailure | null;
}

export interface AuthAuthenticatedState {
  status: 'authenticated';
  session: UserSession;
  failure: AuthFailure | null;
}

export interface AuthErrorState {
  status: 'error';
  session: UserSession | null;
  failure: AuthFailure;
}

export type AuthState =
  | AuthUnknownState
  | AuthLoadingState
  | AuthAnonymousState
  | AuthAuthenticatedState
  | AuthErrorState;
