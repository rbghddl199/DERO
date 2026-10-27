// O02 Auth runtime의 고정 callback·returnTo·actual 연동 조립을 검증한다.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createActualAuthAdapter } from '@/api/auth/actualAdapter';
import { authFailure, authSuccess, type AuthAdapter } from '@/api/auth/port';
import { createAuthRuntime } from '@/components/auth/authRuntime';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import { useAuthStore } from '@/store/authStore';
import type { AuthProvider, UserSession } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';
import { createReturnToRepository, type StorageLike } from '@/utils/auth/returnToRepository';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

function fakeSession(provider: AuthProvider): UserSession {
  return {
    userId: `fake-${provider}`,
    provider,
    role: 'user',
    name: '테스트 사용자',
    email: `${provider}.user@dero.invalid`,
    avatarUrl: null,
    status: 'active',
    onboardingRequired: false,
    joinedAt: '2026-07-01T00:00:00+09:00',
  };
}

// authRuntime의 조율 로직(returnTo·상태 전이·로그아웃)만 검증하는 결정론적 테스트 더블 —
// mockAdapter.ts와 달리 앱 코드가 아니라 이 테스트 파일에만 산다.
function createFakeAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  let session: UserSession | null = null;

  return {
    async authorize(provider) {
      session = fakeSession(provider);
      return authSuccess({ kind: 'success', session });
    },
    async bootstrap() {
      if (session === null) {
        return authFailure(createAuthFailure(AUTH_ERROR_CODES.unauthorized));
      }
      return authSuccess(session);
    },
    async currentSession() {
      return authSuccess(session);
    },
    async refresh() {
      if (session === null) {
        return authFailure(createAuthFailure(AUTH_ERROR_CODES.unauthorized));
      }
      return authSuccess(session);
    },
    async logout() {
      session = null;
      return authSuccess(undefined);
    },
    ...overrides,
  };
}

class MemoryStorage implements StorageLike {
  readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

function runtimeWithStorage(adapter: AuthAdapter, storage = new MemoryStorage()) {
  return {
    runtime: createAuthRuntime({ adapter, returnToRepository: createReturnToRepository(storage) }),
    storage,
  };
}

beforeEach(() => {
  useAuthStore.getState().reset();
});

describe('Auth Route manifest와 integration 경계', () => {
  it('고정 Auth Route와 공통 Sign Route만 존재하고 dynamic provider Route는 만들지 않는다', () => {
    const appRoot = resolve(process.cwd(), 'src/app');

    expect(existsSync(resolve(appRoot, 'sign/page.tsx'))).toBe(true);
    expect(existsSync(resolve(appRoot, 'login/page.tsx'))).toBe(true);
    expect(existsSync(resolve(appRoot, 'signup/page.tsx'))).toBe(true);
    expect(existsSync(resolve(appRoot, 'auth/callback/page.tsx'))).toBe(true);
    expect(existsSync(resolve(appRoot, 'auth/callback/[provider]'))).toBe(false);
  });

  it('sign, login, signup이 같은 SignPage에 보존된 presentation intent를 전달한다', () => {
    const sign = readFileSync(resolve(process.cwd(), 'src/app/sign/page.tsx'), 'utf8');
    const login = readFileSync(resolve(process.cwd(), 'src/app/login/page.tsx'), 'utf8');
    const signup = readFileSync(resolve(process.cwd(), 'src/app/signup/page.tsx'), 'utf8');
    const signPage = readFileSync(
      resolve(process.cwd(), 'src/components/auth/SignPage.tsx'),
      'utf8',
    );

    expect(sign).toContain('<SignPage intent="login" />');
    expect(login).toContain('<SignPage intent="login" />');
    expect(signup).toContain('<SignPage intent="signup" />');
    expect(signPage).toContain('<AuthEntryRoute intent={intent} />');
    expect(sign).not.toMatch(/password|비밀번호|이메일 인증/i);
    expect(login).not.toMatch(/password|비밀번호|이메일 인증/i);
    expect(signup).not.toMatch(/password|비밀번호|이메일 인증/i);
  });
});

describe('Auth Route orchestration', () => {
  it('success callback이 safe returnTo를 한 번 소비하고 session을 설치한다', async () => {
    const { runtime, storage } = runtimeWithStorage(createFakeAdapter());
    runtime.saveReturnTo('/craft?tab=mine');

    expect(await runtime.startAuthorization('kakao')).toEqual({ kind: 'callback' });
    expect(await runtime.completeCallback()).toEqual({
      kind: 'success',
      returnTo: '/craft?tab=mine',
    });
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'authenticated',
      session: { provider: 'kakao' },
    });
    expect(storage.entries.size).toBe(0);
  });

  it.each([
    ['https://evil.example/path', '/'],
    ['//evil.example/path', '/'],
    ['/login?returnTo=/craft', '/'],
    ['/signup', '/'],
    ['/auth/callback', '/'],
  ])('unsafe 또는 재귀 returnTo %s를 %s로 제한한다', async (candidate, expected) => {
    const { runtime } = runtimeWithStorage(createFakeAdapter());
    runtime.saveReturnTo(candidate);
    await runtime.startAuthorization('google');

    expect(await runtime.completeCallback()).toEqual({
      kind: 'success',
      returnTo: expected,
    });
  });

  it('authorize 실패를 callback 표시 상태로 전달한다', async () => {
    const failure = createAuthFailure(AUTH_ERROR_CODES.oauthFailed);
    const { runtime } = runtimeWithStorage(createFakeAdapter({ authorize: async () => authFailure(failure) }));

    expect(await runtime.startAuthorization('google')).toEqual({ kind: 'failure', failure });
  });

  it('session revoked는 anonymous 상태가 된다', async () => {
    const revoked = createAuthFailure(AUTH_ERROR_CODES.sessionRevoked, { httpStatus: 401 });
    const { runtime } = runtimeWithStorage(
      createFakeAdapter({ bootstrap: async () => authFailure(revoked) }),
    );

    expect(await runtime.completeCallback()).toMatchObject({
      kind: 'failure',
      failure: { code: AUTH_ERROR_CODES.sessionRevoked },
    });
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'anonymous',
      session: null,
      failure: { code: AUTH_ERROR_CODES.sessionRevoked },
    });
  });

  it('root bootstrap은 unknown/loading 뒤 anonymous 또는 authenticated로 정착한다', async () => {
    const anonymous = runtimeWithStorage(createFakeAdapter()).runtime;
    const anonymousBootstrap = anonymous.bootstrapRoot();
    expect(useAuthStore.getState().auth.status).toBe('loading');
    await anonymousBootstrap;
    expect(useAuthStore.getState().auth.status).toBe('anonymous');

    useAuthStore.getState().reset();
    const session = fakeSession('google');
    const authenticated = runtimeWithStorage(
      createFakeAdapter({ currentSession: async () => authSuccess(session) }),
    ).runtime;
    await authenticated.bootstrapRoot();
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'authenticated',
      session: { provider: 'google' },
    });
  });

  it('logout은 Auth session만 anonymous로 전이한다', async () => {
    const { runtime } = runtimeWithStorage(createFakeAdapter());
    await runtime.startAuthorization('google');
    await runtime.completeCallback();
    await runtime.logout();

    expect(useAuthStore.getState().auth).toEqual({
      status: 'anonymous',
      session: null,
      failure: null,
    });
  });
});

describe('actual Adapter 연동', () => {
  it('actual adapter의 startAuthorization은 OAuth 인가 엔드포인트로 리다이렉트만 하고 끝나지 않는다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const navigate = vi.fn();
    const runtime = createAuthRuntime({
      adapter: createActualAuthAdapter({ navigate, readCallbackError: () => null }),
    });

    const pending = runtime.startAuthorization('google');
    const raced = await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]);

    expect(navigate).toHaveBeenCalledWith('http://localhost:8080/api/oauth2/authorization/google');
    expect(raced).toBe('pending');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('actual adapter의 completeCallback은 refresh 쿠키와 /users/me로 session을 완성해 store에 반영한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 9,
          email: 'google.user@dero.invalid',
          nickname: '구글유저',
          profileImageUrl: 'https://cdn.dero.invalid/avatar.png',
          provider: 'GOOGLE',
          role: 'USER',
          onboardingRequired: false,
          createdAt: '2026-07-01T00:00:00+09:00',
        }),
      );
    const runtime = createAuthRuntime({
      adapter: createActualAuthAdapter({ navigate: vi.fn(), readCallbackError: () => null }),
    });

    expect(await runtime.completeCallback()).toEqual({ kind: 'success', returnTo: '/' });
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'authenticated',
      session: { provider: 'google', userId: '9', name: '구글유저' },
    });
    fetchSpy.mockRestore();
  });
});
