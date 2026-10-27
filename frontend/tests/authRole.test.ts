// /users/me의 role(USER|ADMIN)이 UserSession.role 소문자로 배선되는지 검증한다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import { createActualAuthAdapter } from '@/api/auth/actualAdapter';
import type { UserSession } from '@/types/auth';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

// refresh()는 POST /auth/refresh(액세스 토큰) → GET /users/me(프로필) 순서로 두 번 fetch한다.
function mockRefreshThenMe(role: 'USER' | 'ADMIN'): void {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'access-token', expiresInSeconds: 600 }),
    )
    .mockResolvedValueOnce(
      jsonResponse(200, {
        id: 7,
        email: 'admin.user@dero.invalid',
        nickname: '운영자',
        profileImageUrl: null,
        provider: 'GOOGLE',
        role,
        onboardingRequired: false,
        createdAt: '2026-07-01T00:00:00+09:00',
      }),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UserSession.role 배선', () => {
  it('role=ADMIN을 admin으로 소문자 매핑한다', async () => {
    mockRefreshThenMe('ADMIN');
    const adapter = createActualAuthAdapter({
      accessTokenHolder: createMemoryAccessTokenHolder(),
      navigate: vi.fn(),
      readCallbackError: () => null,
    });

    const result = await adapter.refresh();

    const expected: UserSession = {
      userId: '7',
      provider: 'google',
      role: 'admin',
      name: '운영자',
      email: 'admin.user@dero.invalid',
      avatarUrl: null,
      status: 'active',
      onboardingRequired: false,
      joinedAt: '2026-07-01T00:00:00+09:00',
    };
    expect(result).toEqual({ ok: true, data: expected });
  });

  it('role=USER를 user로 소문자 매핑한다', async () => {
    mockRefreshThenMe('USER');
    const adapter = createActualAuthAdapter({
      accessTokenHolder: createMemoryAccessTokenHolder(),
      navigate: vi.fn(),
      readCallbackError: () => null,
    });

    const result = await adapter.refresh();

    expect(result.ok && result.data.role).toBe('user');
  });
});
