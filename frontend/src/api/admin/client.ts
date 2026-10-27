// admin — 관리자 API 전용 요청 클라이언트. accessTokenHolder의 Bearer를 자동으로 붙이고
// 401이면 refreshCoordinator로 1회만 재발급·재시도한다(전역 apiClient는 건드리지 않는다).

import { accessTokenHolder as defaultAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import type { AccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess } from '@/api/auth/port';
import {
  createRefreshCoordinator,
  type ProvisionalRefreshCredential,
} from '@/api/auth/refreshCoordinator';
import { apiClient, ApiError } from '@/api/client';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import { useAuthStore } from '@/store/authStore';
import type { AuthFailure, AuthResult } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';
import { mapAuthProblemDetail } from '@/utils/auth/problemDetail';

// POST /api/v1/auth/refresh 응답(RefreshResponse.java) — 액세스 토큰만 바디로, 리프레시는 쿠키로.
interface RefreshResponseBody {
  accessToken: string;
  expiresInSeconds: number;
}

export interface AdminClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export interface AdminClientOptions {
  accessTokenHolder?: AccessTokenHolder;
  refresh?: () => Promise<AuthResult<ProvisionalRefreshCredential>>;
  onSessionTerminated?: (failure: AuthFailure) => void;
}

// 선택 쿼리를 경로에 붙인다 — undefined인 값은 아예 보내지 않는다(page=undefined 방지).
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length === 0 ? path : `${path}?${query}`;
}

function toAuthFailure(error: unknown): AuthFailure {
  if (error instanceof ApiError) {
    return mapAuthProblemDetail(error.problem, error.status);
  }

  return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError, {
    message: '네트워크 오류로 요청을 완료하지 못했습니다.',
  });
}

function authHeaders(accessToken: string | null): Record<string, string> {
  return accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` };
}

// coordinator에 넘길 refresh — 여기서 accessTokenHolder를 직접 건드리지 않는다.
// 새 토큰 반영은 coordinator가 holder.set으로 하고 그 generation으로 replay 여부를 판단한다.
async function requestRefresh(): Promise<AuthResult<ProvisionalRefreshCredential>> {
  try {
    const refreshed = await apiClient.post<RefreshResponseBody>('/auth/refresh', undefined, {
      credentials: 'include',
    });
    return authSuccess({ accessToken: refreshed.accessToken });
  } catch (error) {
    return authFailure(toAuthFailure(error));
  }
}

export function createAdminClient(options: AdminClientOptions = {}): AdminClient {
  const coordinator = createRefreshCoordinator({
    accessTokenHolder: options.accessTokenHolder ?? defaultAccessTokenHolder,
    refresh: options.refresh ?? requestRefresh,
    // 세션이 끝나면(리프레시 무효·강제 종료) canonical Auth 상태로 알린다 — authRuntime과 같은 자리.
    onSessionTerminated:
      options.onSessionTerminated ??
      ((failure) => {
        useAuthStore.getState().handleFailure(failure);
      }),
  });

  // coordinator는 AuthFailure로 실패를 돌려주지만 화면은 ApiError(status·ProblemDetail)를 기대한다.
  // 그래서 실제 던져진 오류를 붙잡아 두었다가 그대로 다시 던진다.
  async function send<T>(run: (accessToken: string | null) => Promise<T>): Promise<T> {
    let lastError: unknown = null;

    const result = await coordinator.execute<T>(async (token) => {
      try {
        return authSuccess(await run(token.accessToken));
      } catch (error) {
        lastError = error;
        return authFailure<T>(toAuthFailure(error));
      }
    });

    if (result.ok) {
      return result.data;
    }
    throw lastError ?? new ApiError(result.failure.httpStatus ?? 401, result.failure.problem);
  }

  return {
    get: <T>(path: string): Promise<T> =>
      send<T>((token) =>
        apiClient.get<T>(path, { headers: authHeaders(token), cache: 'no-store' }),
      ),
    post: <T>(path: string, body?: unknown): Promise<T> =>
      send<T>((token) => apiClient.post<T>(path, body, { headers: authHeaders(token) })),
    put: <T>(path: string, body?: unknown): Promise<T> =>
      send<T>((token) => apiClient.put<T>(path, body, { headers: authHeaders(token) })),
    patch: <T>(path: string, body?: unknown): Promise<T> =>
      send<T>((token) => apiClient.patch<T>(path, body, { headers: authHeaders(token) })),
    delete: <T>(path: string): Promise<T> =>
      send<T>((token) => apiClient.delete<T>(path, { headers: authHeaders(token) })),
  };
}

// 관리자 화면이 공유하는 모듈 싱글턴 — accessTokenHolder·authRuntime과 같은 패턴.
// 세션이 한 번 종료되면 coordinator는 계속 실패를 돌려준다. 재로그인은 OAuth 전체 페이지
// 리다이렉트라 문서가 새로 뜨면서 이 모듈도 초기화되므로 별도 reset 배선은 두지 않는다.
export const adminClient = createAdminClient();
