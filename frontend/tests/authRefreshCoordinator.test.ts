// refresh single-flight·1회 replay·revoked/forbidden loop 차단을 검증한다.

import { describe, expect, it, vi } from 'vitest';
import { createMemoryAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { authFailure, authSuccess } from '@/api/auth/port';
import { createRefreshCoordinator } from '@/api/auth/refreshCoordinator';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { AuthFailure, AuthResult } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';

function failure(code: Parameters<typeof createAuthFailure>[0]): AuthFailure {
  return createAuthFailure(code, {
    httpStatus: code === AUTH_ERROR_CODES.forbidden ? 403 : 401,
  });
}

function runtimeCredential() {
  return { accessToken: globalThis.crypto.randomUUID() };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('RefreshCoordinator', () => {
  it('AUTH_UNAUTHORIZED logical request를 refresh 후 한 번만 replay한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    let attempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated: vi.fn(),
    });

    const result = await coordinator.execute(async (token) => {
      attempts += 1;
      return attempts === 1
        ? authFailure<number>(failure(AUTH_ERROR_CODES.unauthorized))
        : authSuccess(token.generation);
    });

    expect(result).toEqual({ ok: true, data: 1 });
    expect(attempts).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('동시 unauthorized 요청 N개가 하나의 refresh Promise를 공유한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    const gate = deferred();
    const refresh = vi.fn(async () => {
      await gate.promise;
      return authSuccess(runtimeCredential());
    });
    const attempts = [0, 0, 0, 0, 0];
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated: vi.fn(),
    });

    const requests = attempts.map((_, index) =>
      coordinator.execute(async () => {
        attempts[index] += 1;
        return attempts[index] === 1
          ? authFailure<number>(failure(AUTH_ERROR_CODES.unauthorized))
          : authSuccess(index);
      }),
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    gate.resolve();

    expect(await Promise.all(requests)).toEqual(
      attempts.map((_, index) => ({ ok: true, data: index })),
    );
    expect(attempts).toEqual([2, 2, 2, 2, 2]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('replay 401이 두 번째 refresh를 만들지 않는다', async () => {
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    let attempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: createMemoryAccessTokenHolder(),
      refresh,
      onSessionTerminated: vi.fn(),
    });

    const result = await coordinator.execute(async () => {
      attempts += 1;
      return authFailure(failure(AUTH_ERROR_CODES.unauthorized));
    });

    expect(result).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.unauthorized },
    });
    expect(attempts).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('AUTH_SESSION_REVOKED는 zero-refresh, zero-replay로 session을 종료한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    holder.set(globalThis.crypto.randomUUID());
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    const onSessionTerminated = vi.fn();
    let attempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated,
    });

    const result = await coordinator.execute(async () => {
      attempts += 1;
      return authFailure(failure(AUTH_ERROR_CODES.sessionRevoked));
    });

    expect(result).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.sessionRevoked },
    });
    expect(attempts).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(holder.snapshot().accessToken).toBeNull();
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
  });

  it('AUTH_REFRESH_INVALID는 zero-refresh, zero-replay로 session을 종료한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    holder.set(globalThis.crypto.randomUUID());
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    const onSessionTerminated = vi.fn();
    let attempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated,
    });

    const result = await coordinator.execute(async () => {
      attempts += 1;
      return authFailure(failure(AUTH_ERROR_CODES.refreshInvalid));
    });

    expect(result).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.refreshInvalid },
    });
    expect(attempts).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(holder.snapshot().accessToken).toBeNull();
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
  });

  it('AUTH_FORBIDDEN은 refresh와 session 종료 없이 typed failure를 반환한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    const volatileCredential = globalThis.crypto.randomUUID();
    holder.set(volatileCredential);
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    const onSessionTerminated = vi.fn();
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated,
    });

    const result = await coordinator.execute(async () =>
      authFailure(failure(AUTH_ERROR_CODES.forbidden)),
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.forbidden },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionTerminated).not.toHaveBeenCalled();
    expect(holder.snapshot().accessToken).toBe(volatileCredential);
  });

  it('refresh 진행 중 revoked가 오면 queued request를 replay하지 않는다', async () => {
    const gate = deferred();
    const refresh = vi.fn(async () => {
      await gate.promise;
      return authSuccess(runtimeCredential());
    });
    const onSessionTerminated = vi.fn();
    let queuedAttempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: createMemoryAccessTokenHolder(),
      refresh,
      onSessionTerminated,
    });

    const queued = coordinator.execute(async () => {
      queuedAttempts += 1;
      return authFailure<string>(failure(AUTH_ERROR_CODES.unauthorized));
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const revoked = await coordinator.execute(async () =>
      authFailure<string>(failure(AUTH_ERROR_CODES.sessionRevoked)),
    );
    gate.resolve();

    expect(revoked).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.sessionRevoked },
    });
    expect(await queued).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.sessionRevoked },
    });
    expect(queuedAttempts).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
  });

  it('동시 refresh 실패 waiter가 같은 failure를 받고 local 종료는 한 번만 수행한다', async () => {
    const refreshFailure = failure(AUTH_ERROR_CODES.unauthorized);
    const refresh = vi.fn(async (): Promise<AuthResult<{ accessToken: string }>> =>
      authFailure(refreshFailure),
    );
    const onSessionTerminated = vi.fn();
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: createMemoryAccessTokenHolder(),
      refresh,
      onSessionTerminated,
    });

    const requests = [0, 1, 2].map(() =>
      coordinator.execute(async () => authFailure<number>(failure(AUTH_ERROR_CODES.unauthorized))),
    );
    const results = await Promise.all(requests);

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure).toBe(refreshFailure);
      }
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
  });

  it('요청 중 더 새 generation이 설치되면 추가 refresh 없이 한 번 replay한다', async () => {
    const holder = createMemoryAccessTokenHolder();
    const gate = deferred();
    const refresh = vi.fn(async () => authSuccess(runtimeCredential()));
    let attempts = 0;
    const coordinator = createRefreshCoordinator({
      accessTokenHolder: holder,
      refresh,
      onSessionTerminated: vi.fn(),
    });

    const request = coordinator.execute(async (token) => {
      attempts += 1;
      if (attempts === 1) {
        await gate.promise;
        return authFailure<number>(failure(AUTH_ERROR_CODES.unauthorized));
      }
      return authSuccess(token.generation);
    });

    holder.set(globalThis.crypto.randomUUID());
    gate.resolve();

    expect(await request).toEqual({ ok: true, data: 1 });
    expect(attempts).toBe(2);
    expect(refresh).not.toHaveBeenCalled();
  });
});
