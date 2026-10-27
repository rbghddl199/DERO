// adminClient의 Bearer 자동 부착과 401 1회 재발급·재시도, 재실패 시 ApiError 전파를 검증한다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess } from '@/api/auth/port';
import { createAdminClient } from '@/api/admin/client';
import { ApiError } from '@/api/client';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import { createAuthFailure } from '@/utils/auth/failures';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

// 401 응답 바디는 ADR-0008 ProblemDetail이어야 AUTH_UNAUTHORIZED로 분류된다.
function unauthorizedResponse(): Response {
  return jsonResponse(401, {
    title: 'Unauthorized',
    status: 401,
    detail: '인증이 필요합니다.',
    instance: '/api/v1/admin/brands',
    code: AUTH_ERROR_CODES.unauthorized,
    errors: null,
  });
}

function authorizationHeaderOf(call: [unknown, RequestInit | undefined]): string | undefined {
  const headers = call[1]?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adminClient', () => {
  it('accessTokenHolder의 토큰을 Bearer로 붙여 보낸다', async () => {
    const holder = createMemoryAccessTokenHolder();
    holder.set('first-token');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { content: [], page: { number: 0 } }));
    const client = createAdminClient({
      accessTokenHolder: holder,
      refresh: vi.fn(),
      onSessionTerminated: vi.fn(),
    });

    await client.get('/admin/brands');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(authorizationHeaderOf(fetchSpy.mock.calls[0])).toBe('Bearer first-token');
  });

  it('401이면 refresh 후 새 토큰으로 한 번만 재시도한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    holder.set('stale-token');
    const refresh = vi.fn(async () => authSuccess({ accessToken: 'fresh-token' }));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, name: '브랜드' }));
    const client = createAdminClient({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated: vi.fn(),
    });

    const result = await client.get<{ id: number; name: string }>('/admin/brands/1');

    expect(result).toEqual({ id: 1, name: '브랜드' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(authorizationHeaderOf(fetchSpy.mock.calls[0])).toBe('Bearer stale-token');
    expect(authorizationHeaderOf(fetchSpy.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('재발급이 실패하면 원래 ApiError를 그대로 던지고 세션 종료를 알린다', async () => {
    const holder = createMemoryAccessTokenHolder();
    holder.set('stale-token');
    const refresh = vi.fn(async () =>
      authFailure<{ accessToken: string }>(
        createAuthFailure(AUTH_ERROR_CODES.refreshInvalid, { httpStatus: 401 }),
      ),
    );
    const onSessionTerminated = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unauthorizedResponse());
    const client = createAdminClient({ accessTokenHolder: holder, refresh, onSessionTerminated });

    const thrown = await client.get('/admin/brands').catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(401);
    expect((thrown as ApiError).problem?.code).toBe(AUTH_ERROR_CODES.unauthorized);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
  });
});
