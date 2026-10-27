// 백엔드 REST API 호출용 fetch 기반 client. ADR-0008: 성공은 리소스 그대로, 실패는 ProblemDetail.

import { accessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess } from '@/api/auth/port';
import type { RefreshCoordinator } from '@/api/auth/refreshCoordinator';
import { API_BASE_URL } from '@/constants/api';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { ApiProblemDetail } from '@/types/api';
import type { AuthFailure } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';
import { parseApiProblemDetail } from '@/utils/problemDetail';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ApiProblemDetail | null;

  constructor(status: number, problem: ApiProblemDetail | null) {
    super(problem?.detail ?? `API 요청에 실패했습니다. (status: ${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

// /api/v1/auth/* 는 httpOnly 리프레시 쿠키로만 인증한다 — Bearer도 붙이지 않고 401 회전도 걸지 않는다.
// 여기에 회전을 걸면 refresh가 401일 때 refresh를 다시 부르는 무한 루프가 된다.
function isAuthEndpoint(path: string): boolean {
  return path === '/auth' || path.startsWith('/auth/');
}

// 401 자동 회전(결정 7)의 배선점. refresh 구현은 actualAdapter에 있고 그쪽이 이 모듈을 쓰므로
// 여기서 직접 import하면 순환이다 — 부팅 시 authRuntime이 만들어 넣어준다.
let refreshCoordinator: RefreshCoordinator | null = null;

export function setApiRefreshCoordinator(coordinator: RefreshCoordinator | null): void {
  refreshCoordinator = coordinator;
}

// 회전 판정에 필요한 최소 분류다. utils/auth/problemDetail의 mapAuthProblemDetail을 쓰지 않는 이유는
// 그쪽이 `errors` 필드를 필수로 요구하는데 백엔드 인증 실패 바디(ProblemDetails.of)는 검증 실패가
// 아니라서 그 필드를 안 싣기 때문이다 — 그대로 쓰면 모든 401이 UNCLASSIFIED로 뭉개져 재시도가 죽는다.
function toAuthFailure(error: unknown): AuthFailure {
  if (!(error instanceof ApiError)) {
    return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError);
  }
  if (error.status !== 401) {
    return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError, { httpStatus: error.status });
  }

  const code = error.problem?.code;
  // 이 둘은 refresh로 회복이 안 된다 — coordinator가 재시도 없이 세션을 끝낸다.
  if (code === AUTH_ERROR_CODES.sessionRevoked || code === AUTH_ERROR_CODES.refreshInvalid) {
    return createAuthFailure(code, { httpStatus: 401 });
  }
  return createAuthFailure(AUTH_ERROR_CODES.unauthorized, { httpStatus: 401 });
}

async function send<T>(
  path: string,
  options: RequestOptions,
  accessToken: string | null,
): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
      // 호출부가 명시한 헤더가 항상 이긴다 — actualAdapter가 자기 holder의 토큰을 직접 붙이는 경로.
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, parseApiProblemDetail(payload));
  }

  return payload as T;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const coordinator = refreshCoordinator;

  if (coordinator === null || isAuthEndpoint(path)) {
    const token = isAuthEndpoint(path) ? null : accessTokenHolder.snapshot().accessToken;
    return send<T>(path, options, token);
  }

  // coordinator는 Result를 돌려주지만 apiClient는 계속 throw한다 — placement.ts 등 도메인 모듈이
  // 전부 throw 전제라, 경계에서 원래 ApiError를 그대로 되던져 호출부를 무수정으로 남긴다.
  let thrown: unknown = null;
  const result = await coordinator.execute<T>(async (token) => {
    try {
      return authSuccess(await send<T>(path, options, token.accessToken));
    } catch (error) {
      thrown = error;
      return authFailure<T>(toAuthFailure(error));
    }
  });

  if (result.ok) {
    return result.data;
  }
  if (thrown !== null) {
    throw thrown;
  }
  // 요청이 아니라 회전 자체가 실패한 경우 — 남길 원본 오류가 없어 failure를 ApiError로 되돌린다.
  throw new ApiError(result.failure.httpStatus ?? 401, result.failure.problem);
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
