// canonical Auth 상태와 actual Adapter 계약을 검증한다.

import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createActualAuthAdapter } from '@/api/auth/actualAdapter';
import { createMemoryAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import { useAuthStore } from '@/store/authStore';
import type { AuthProvider, AuthStatus, UserSession } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

const GOOGLE_SESSION: UserSession = {
  userId: 'runtime-user',
  provider: 'google',
  role: 'user',
  name: '테스트 사용자',
  email: 'runtime.user@dero.invalid',
  avatarUrl: null,
  status: 'active',
  onboardingRequired: false,
  joinedAt: '2026-07-01T00:00:00+09:00',
};

beforeEach(() => {
  useAuthStore.getState().reset();
});

describe('canonical Auth domain', () => {
  it('provider와 상태 union을 확정 값으로 제한한다', () => {
    expectTypeOf<AuthProvider>().toEqualTypeOf<'google' | 'kakao'>();
    expectTypeOf<AuthStatus>().toEqualTypeOf<
      'unknown' | 'loading' | 'anonymous' | 'authenticated' | 'error'
    >();
  });

  it('unknown에서 loading, authenticated, anonymous로 전이한다', () => {
    expect(useAuthStore.getState().auth.status).toBe('unknown');

    useAuthStore.getState().startLoading();
    expect(useAuthStore.getState().auth).toEqual({
      status: 'loading',
      session: null,
      failure: null,
    });

    useAuthStore.getState().setAuthenticated(GOOGLE_SESSION);
    useAuthStore.getState().startLoading();
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'loading',
      session: GOOGLE_SESSION,
    });

    useAuthStore.getState().setAnonymous();
    expect(useAuthStore.getState().auth).toEqual({
      status: 'anonymous',
      session: null,
      failure: null,
    });
  });

  it('forbidden은 authenticated session을 유지한다', () => {
    const forbidden = createAuthFailure(AUTH_ERROR_CODES.forbidden, {
      httpStatus: 403,
    });
    useAuthStore.getState().setAuthenticated(GOOGLE_SESSION);
    useAuthStore.getState().handleFailure(forbidden);

    expect(useAuthStore.getState().auth).toEqual({
      status: 'authenticated',
      session: GOOGLE_SESSION,
      failure: forbidden,
    });
  });

  it('session revoked는 local session을 종료한다', () => {
    const revoked = createAuthFailure(AUTH_ERROR_CODES.sessionRevoked, {
      httpStatus: 401,
    });
    useAuthStore.getState().setAuthenticated(GOOGLE_SESSION);
    useAuthStore.getState().handleFailure(revoked);

    expect(useAuthStore.getState().auth).toEqual({
      status: 'anonymous',
      session: null,
      failure: revoked,
    });
  });

  it('일반 typed failure는 canonical error 상태로 전이한다', () => {
    const failure = createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError);
    useAuthStore.getState().setError(failure);

    expect(useAuthStore.getState().auth).toEqual({
      status: 'error',
      session: null,
      failure,
    });
  });
});

describe('actual Adapter — 실제 백엔드 연동(ADR-0005)', () => {
  it('authorize는 fetch 없이 OAuth 인가 엔드포인트로만 리다이렉트하고 절대 resolve되지 않는다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const navigate = vi.fn();
    const adapter = createActualAuthAdapter({ navigate, readCallbackError: () => null });

    const pending = adapter.authorize('kakao');
    const raced = await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]);

    expect(navigate).toHaveBeenCalledWith('http://localhost:8080/api/oauth2/authorization/kakao');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(raced).toBe('pending');
    fetchSpy.mockRestore();
  });

  it('bootstrap은 콜백 쿼리에 error가 있으면 fetch 없이 실패한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = createActualAuthAdapter({
      navigate: vi.fn(),
      readCallbackError: () => 'AUTH_EMAIL_ALREADY_REGISTERED',
    });

    expect(await adapter.bootstrap()).toMatchObject({
      ok: false,
      failure: { code: AUTH_ERROR_CODES.emailAlreadyRegistered },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('bootstrap은 error가 없으면 refresh 쿠키 → /users/me 순서로 session을 완성한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 7,
          email: 'kakao.user@dero.invalid',
          nickname: '카카오유저',
          profileImageUrl: null,
          provider: 'KAKAO',
          role: 'USER',
          onboardingRequired: false,
          createdAt: '2026-07-01T00:00:00+09:00',
        }),
      );
    const holder = createMemoryAccessTokenHolder();
    const adapter = createActualAuthAdapter({
      navigate: vi.fn(),
      readCallbackError: () => null,
      accessTokenHolder: holder,
    });

    expect(await adapter.bootstrap()).toEqual({
      ok: true,
      data: {
        userId: '7',
        provider: 'kakao',
        role: 'user',
        name: '카카오유저',
        email: 'kakao.user@dero.invalid',
        avatarUrl: null,
        status: 'active',
        onboardingRequired: false,
        joinedAt: '2026-07-01T00:00:00+09:00',
      },
    });
    expect(holder.snapshot().accessToken).toBe('access-1');
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/api/v1/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/api/v1/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-1' }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('currentSession은 refresh 쿠키가 없으면(401 AUTH_REFRESH_INVALID) 에러 없이 anonymous를 뜻하는 null을 준다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      // Spring ProblemDetail은 type이 about:blank면 필드 자체를 생략한다(problemDetail.ts 참고).
      jsonResponse(401, {
        title: 'Unauthorized',
        status: 401,
        detail: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        instance: '/api/v1/auth/refresh',
        code: AUTH_ERROR_CODES.refreshInvalid,
        errors: null,
      }),
    );
    const adapter = createActualAuthAdapter({ navigate: vi.fn(), readCallbackError: () => null });

    expect(await adapter.currentSession()).toEqual({ ok: true, data: null });
    fetchSpy.mockRestore();
  });

  it('logout은 네트워크 실패에도 로컬 access token을 지우고 성공을 반환한다(멱등)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));
    const holder = createMemoryAccessTokenHolder();
    holder.set('stale-token');
    const adapter = createActualAuthAdapter({
      navigate: vi.fn(),
      readCallbackError: () => null,
      accessTokenHolder: holder,
    });

    expect(await adapter.logout()).toEqual({ ok: true, data: undefined });
    expect(holder.snapshot().accessToken).toBeNull();
    fetchSpy.mockRestore();
  });
});
