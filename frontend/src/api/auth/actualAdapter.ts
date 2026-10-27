// 소셜 OAuth·JWT 액세스/리프레시(ADR-0005)로 실제 백엔드와 연동하는 Auth Adapter 구현.

import { apiClient, ApiError } from '@/api/client';
import { accessTokenHolder as defaultAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import type { AccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess, type AuthAdapter } from '@/api/auth/port';
import type { ProvisionalRefreshCredential } from '@/api/auth/refreshCoordinator';
import { API_ORIGIN } from '@/constants/api';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type {
  AuthFailure,
  AuthProvider,
  AuthResult,
  ProvisionalAuthorizationOutcome,
  UserSession,
} from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';
import { mapAuthProblemDetail } from '@/utils/auth/problemDetail';

interface ActualAuthAdapterOptions {
  accessTokenHolder?: AccessTokenHolder;
  // 브라우저 API를 직접 참조하지 않고 주입받는다 — node 환경 유닛 테스트가 window 없이도 돈다.
  navigate?: (url: string) => void;
  readCallbackError?: () => string | null;
}

// POST /api/v1/auth/refresh 응답(RefreshResponse.java) — 액세스 토큰만 바디로, 리프레시는 쿠키로.
interface RefreshResponseBody {
  accessToken: string;
  expiresInSeconds: number;
}

// GET /api/v1/users/me 응답(UserMeResponse.java) — provider·role은 백엔드 enum 그대로(대문자) 온다.
interface UserMeResponseBody {
  id: number;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  provider: 'GOOGLE' | 'KAKAO';
  role: 'USER' | 'ADMIN';
  onboardingRequired: boolean;
  createdAt: string;
}

function defaultNavigate(url: string): void {
  window.location.assign(url);
}

function defaultReadCallbackError(): string | null {
  return new URLSearchParams(window.location.search).get('error');
}

function toAuthFailure(error: unknown): AuthFailure {
  if (error instanceof ApiError) {
    return mapAuthProblemDetail(error.problem, error.status);
  }

  return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError, {
    message: '네트워크 오류로 요청을 완료하지 못했습니다.',
  });
}

function toUserSession(me: UserMeResponseBody): UserSession {
  return {
    userId: String(me.id),
    provider: me.provider === 'GOOGLE' ? 'google' : 'kakao',
    role: me.role === 'ADMIN' ? 'admin' : 'user',
    name: me.nickname,
    email: me.email,
    avatarUrl: me.profileImageUrl,
    status: 'active',
    onboardingRequired: me.onboardingRequired,
    joinedAt: me.createdAt,
  };
}

// 백엔드 OAuth2LoginSuccessHandler/OAuth2LoginFailureHandler가 콜백 리다이렉트에 붙이는 코드.
function oauthCallbackFailure(code: string): AuthFailure {
  if (code === AUTH_ERROR_CODES.emailAlreadyRegistered) {
    return createAuthFailure(AUTH_ERROR_CODES.emailAlreadyRegistered);
  }
  return createAuthFailure(AUTH_ERROR_CODES.oauthFailed);
}

// POST /api/v1/auth/refresh 한 번 — 액세스 토큰만 돌려주고 holder·프로필은 건드리지 않는다.
// apiClient의 401 자동 회전(결정 7)이 이 함수를 refreshCoordinator에 물려 쓴다.
export async function requestRefreshedAccessToken(): Promise<
  AuthResult<ProvisionalRefreshCredential>
> {
  try {
    const refreshed = await apiClient.post<RefreshResponseBody>('/auth/refresh', undefined, {
      credentials: 'include',
    });
    return authSuccess({ accessToken: refreshed.accessToken });
  } catch (error) {
    return authFailure(toAuthFailure(error));
  }
}

export function createActualAuthAdapter(options: ActualAuthAdapterOptions = {}): AuthAdapter {
  const accessTokenHolder = options.accessTokenHolder ?? defaultAccessTokenHolder;
  const navigate = options.navigate ?? defaultNavigate;
  const readCallbackError = options.readCallbackError ?? defaultReadCallbackError;

  async function fetchProfile(accessToken: string): Promise<AuthResult<UserSession>> {
    try {
      const me = await apiClient.get<UserMeResponseBody>('/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return authSuccess(toUserSession(me));
    } catch (error) {
      return authFailure(toAuthFailure(error));
    }
  }

  // 리프레시 쿠키(httpOnly)로 새 액세스 토큰을 받고 프로필까지 채운 UserSession을 만든다.
  // bootstrap(콜백 직후 검증)과 refresh(만료 시 재발급) 둘 다 이 경로를 공유한다.
  async function refreshSession(): Promise<AuthResult<UserSession>> {
    const refreshed = await requestRefreshedAccessToken();
    if (!refreshed.ok) {
      return authFailure(refreshed.failure);
    }

    accessTokenHolder.set(refreshed.data.accessToken);
    return fetchProfile(refreshed.data.accessToken);
  }

  return {
    // 전체 페이지 리다이렉트라 이 Promise는 절대 해소되지 않는다 — 브라우저가 이 문서를 떠난다.
    // 여기서 resolve하면 호출부(AuthEntryRoute)가 곧바로 router.replace('/auth/callback')를 불러
    // 진짜 브라우저 이동과 SPA 이동이 경합한다. 콜백 완료는 /auth/callback에서 bootstrap()이 잇는다.
    authorize(provider: AuthProvider): Promise<AuthResult<ProvisionalAuthorizationOutcome>> {
      navigate(`${API_ORIGIN}/api/oauth2/authorization/${provider}`);
      return new Promise<AuthResult<ProvisionalAuthorizationOutcome>>(() => {});
    },

    async bootstrap(): Promise<AuthResult<UserSession>> {
      const errorCode = readCallbackError();
      if (errorCode !== null) {
        return authFailure(oauthCallbackFailure(errorCode));
      }

      return refreshSession();
    },

    async currentSession(): Promise<AuthResult<UserSession | null>> {
      const result = await refreshSession();
      // 익명 신호는 AUTH_REFRESH_INVALID뿐이다 — /auth/refresh가 쿠키 없음·만료를 이 코드로 알린다.
      // 이 경로의 AUTH_UNAUTHORIZED는 refresh 성공 직후 /users/me가 거절당한 것이라 익명이 아니라 진짜 오류다.
      if (!result.ok && result.failure.code === AUTH_ERROR_CODES.refreshInvalid) {
        return authSuccess(null);
      }
      return result;
    },

    refresh(): Promise<AuthResult<UserSession>> {
      return refreshSession();
    },

    async logout(): Promise<AuthResult<void>> {
      try {
        await apiClient.post<void>('/auth/logout', undefined, { credentials: 'include' });
      } catch {
        // 로그아웃은 멱등이다(AuthController 주석) — 네트워크 실패에도 로컬 상태는 정리한다.
      }
      accessTokenHolder.clear();
      return authSuccess(undefined);
    },
  };
}
