// apiClient의 Bearer 자동 부착과 401 자동 회전 재시도(결정 7)를 검증한다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess } from '@/api/auth/port';
import {
  createRefreshCoordinator,
  type ProvisionalRefreshCredential,
} from '@/api/auth/refreshCoordinator';
import { apiClient, ApiError, setApiRefreshCoordinator } from '@/api/client';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { AuthResult } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';

interface StubResponse {
  status: number;
  body?: unknown;
}

interface FetchCall {
  url: string;
  headers: Record<string, string>;
}

const calls: FetchCall[] = [];

// 백엔드 인증 실패 바디(ProblemDetails.of) — 검증 실패가 아니라 `errors` 필드가 없다.
function unauthorizedBody(code: string) {
  return {
    title: 'Unauthorized',
    status: 401,
    detail: '로그인이 필요합니다.',
    instance: '/api/v1/placements',
    code,
  };
}

function stubFetch(responses: StubResponse[]): void {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: { ...(init.headers as Record<string, string>) } });
      const next = queue.shift();
      if (next === undefined) {
        throw new Error(`예상하지 않은 fetch 호출: ${url}`);
      }
      // 204는 바디를 가질 수 없다 — Response 생성자가 거부한다.
      return new Response(next.status === 204 ? null : JSON.stringify(next.body ?? null), {
        status: next.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

// client.ts가 쓰는 모듈 싱글턴 holder를 그대로 물려 실제 배선과 같은 조립을 만든다.
function wireCoordinator(
  refresh: () => Promise<AuthResult<ProvisionalRefreshCredential>>,
  onSessionTerminated = vi.fn(),
) {
  setApiRefreshCoordinator(
    createRefreshCoordinator({ accessTokenHolder, refresh, onSessionTerminated }),
  );
  return onSessionTerminated;
}

beforeEach(() => {
  calls.length = 0;
  accessTokenHolder.clear();
  setApiRefreshCoordinator(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiRefreshCoordinator(null);
  accessTokenHolder.clear();
});

describe('apiClient Bearer 자동 부착', () => {
  it('holder에 토큰이 있으면 Authorization 헤더를 붙인다', async () => {
    accessTokenHolder.set('access-1');
    stubFetch([{ status: 200, body: { id: 1 } }]);

    await apiClient.get('/placements/1');

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer access-1');
  });

  it('holder가 비어 있으면 Authorization 헤더를 붙이지 않는다', async () => {
    stubFetch([{ status: 200, body: { content: [] } }]);

    await apiClient.get('/placements');

    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});

describe('apiClient 401 자동 회전', () => {
  it('401이면 회전 후 새 토큰으로 한 번 재시도한다', async () => {
    accessTokenHolder.set('access-expired');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'access-fresh' }));
    wireCoordinator(refresh);
    stubFetch([
      { status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.unauthorized) },
      { status: 200, body: { id: 7 } },
    ]);

    await expect(apiClient.get('/placements/7')).resolves.toEqual({ id: 7 });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toBe('Bearer access-expired');
    expect(calls[1].headers.Authorization).toBe('Bearer access-fresh');
  });

  it('재시도도 401이면 두 번째 회전 없이 원래 ApiError를 던진다', async () => {
    accessTokenHolder.set('access-expired');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'access-fresh' }));
    wireCoordinator(refresh);
    stubFetch([
      { status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.unauthorized) },
      { status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.unauthorized) },
    ]);

    await expect(apiClient.get('/placements/7')).rejects.toBeInstanceOf(ApiError);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('회전 자체가 실패하면 재시도하지 않고 세션을 끝낸다', async () => {
    accessTokenHolder.set('access-expired');
    const refresh = vi.fn(async (): Promise<AuthResult<ProvisionalRefreshCredential>> =>
      authFailure(createAuthFailure(AUTH_ERROR_CODES.refreshInvalid, { httpStatus: 401 })),
    );
    const onSessionTerminated = wireCoordinator(refresh);
    stubFetch([{ status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.unauthorized) }]);

    await expect(apiClient.get('/placements/7')).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
    expect(accessTokenHolder.snapshot().accessToken).toBeNull();
  });

  it('AUTH_SESSION_REVOKED는 회전·재시도 없이 세션을 끝낸다', async () => {
    accessTokenHolder.set('access-revoked');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'access-fresh' }));
    const onSessionTerminated = wireCoordinator(refresh);
    stubFetch([{ status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.sessionRevoked) }]);

    await expect(apiClient.get('/placements/7')).rejects.toBeInstanceOf(ApiError);

    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
    expect(accessTokenHolder.snapshot().accessToken).toBeNull();
  });
});

describe('/api/v1/auth/* 제외', () => {
  it('/auth/refresh는 Bearer도 안 붙고 401이어도 재시도하지 않는다', async () => {
    accessTokenHolder.set('access-expired');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'access-fresh' }));
    wireCoordinator(refresh);
    stubFetch([{ status: 401, body: unauthorizedBody(AUTH_ERROR_CODES.refreshInvalid) }]);

    await expect(
      apiClient.post('/auth/refresh', undefined, { credentials: 'include' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('/auth/logout도 회전 대상이 아니다', async () => {
    accessTokenHolder.set('access-1');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'access-fresh' }));
    wireCoordinator(refresh);
    stubFetch([{ status: 204 }]);

    await apiClient.post('/auth/logout', undefined, { credentials: 'include' });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});
