// 온보딩(닉네임·약관) 배선 검증 — 로그인 직후 목적지 결정, 제출 게이트, 요청 1회, 409 분류.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createActualAuthAdapter } from '@/api/auth/actualAdapter';
import { ApiError } from '@/api/client';
import { fetchTerms, submitConsents, updateNickname, type TermsResponse } from '@/api/onboarding';
import { createAuthRuntime } from '@/components/auth/authRuntime';
import { useAuthStore } from '@/store/authStore';
import {
  NICKNAME_DUPLICATED_CODE,
  ONBOARDING_PATH,
  canSubmitConsents,
  checkedTermsIds,
  resolvePostLoginDestination,
} from '@/utils/auth/onboarding';
import { createReturnToRepository, type StorageLike } from '@/utils/auth/returnToRepository';

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const calls: FetchCall[] = [];

function stubFetch(responses: { status: number; body?: unknown }[]): void {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      });
      const next = queue.shift();
      if (next === undefined) {
        throw new Error(`예상하지 않은 fetch 호출: ${url}`);
      }
      return new Response(next.status === 204 ? null : JSON.stringify(next.body ?? null), {
        status: next.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

function terms(overrides: Partial<TermsResponse> & { id: number }): TermsResponse {
  return {
    code: 'TERMS_OF_SERVICE',
    revision: 1,
    title: '서비스 이용약관',
    contentUrl: undefined,
    required: true,
    effectiveAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

const REQUIRED_A = terms({ id: 1, code: 'TERMS_OF_SERVICE' });
const REQUIRED_B = terms({ id: 2, code: 'PRIVACY_POLICY' });
const OPTIONAL = terms({ id: 3, code: 'MARKETING', required: false });

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

beforeEach(() => {
  calls.length = 0;
  useAuthStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('로그인 직후 목적지', () => {
  it('온보딩이 남아 있으면 원래 목적지를 쿼리로 넘겨 온보딩 화면으로 보낸다', () => {
    expect(resolvePostLoginDestination(true, '/craft?tab=mine')).toBe(
      `${ONBOARDING_PATH}?returnTo=${encodeURIComponent('/craft?tab=mine')}`,
    );
  });

  it('온보딩이 남아 있고 갈 곳이 없으면 쿼리 없이 온보딩으로 보낸다', () => {
    expect(resolvePostLoginDestination(true, null)).toBe(ONBOARDING_PATH);
  });

  it('온보딩을 마친 계정은 원래 목적지로 그대로 간다 — 온보딩 화면을 거치지 않는다', () => {
    expect(resolvePostLoginDestination(false, '/craft')).toBe('/craft');
    expect(resolvePostLoginDestination(false, null)).toBe('/');
  });

  it('returnTo가 온보딩 자신이면 버린다 — 완료 후 자기 자신으로 replace하는 왕복을 막는다', () => {
    expect(resolvePostLoginDestination(false, ONBOARDING_PATH)).toBe('/');
  });

  it('콜백이 onboardingRequired=true인 세션을 받으면 온보딩 경로를 돌려준다', async () => {
    stubFetch([
      { status: 200, body: { accessToken: 'access-1', expiresInSeconds: 1800 } },
      {
        status: 200,
        body: {
          id: 7,
          email: 'new@dero.invalid',
          nickname: '카카오실명',
          profileImageUrl: null,
          provider: 'KAKAO',
          role: 'USER',
          onboardingRequired: true,
          createdAt: '2026-07-01T00:00:00+09:00',
        },
      },
    ]);
    const runtime = createAuthRuntime({
      adapter: createActualAuthAdapter({ navigate: vi.fn(), readCallbackError: () => null }),
      returnToRepository: createReturnToRepository(new MemoryStorage()),
    });

    expect(await runtime.completeCallback()).toEqual({
      kind: 'success',
      returnTo: ONBOARDING_PATH,
    });
    expect(useAuthStore.getState().auth).toMatchObject({
      status: 'authenticated',
      session: { name: '카카오실명', onboardingRequired: true },
    });
  });
});

describe('약관 제출 게이트', () => {
  it('필수를 다 체크해야 제출이 열린다 — 선택 항목은 조건이 아니다', () => {
    const all = [REQUIRED_A, REQUIRED_B, OPTIONAL];

    expect(canSubmitConsents(all, new Set([1]))).toBe(false);
    expect(canSubmitConsents(all, new Set([1, 3]))).toBe(false);
    expect(canSubmitConsents(all, new Set([1, 2]))).toBe(true);
    expect(canSubmitConsents(all, new Set([1, 2, 3]))).toBe(true);
  });

  it('필수 항목이 하나도 없으면 제출을 열지 않는다 — 받을 동의가 없는 화면이다', () => {
    expect(canSubmitConsents([OPTIONAL], new Set([3]))).toBe(false);
  });

  it('체크된 항목만 목록 순서대로 싣는다', () => {
    expect(checkedTermsIds([REQUIRED_A, REQUIRED_B, OPTIONAL], new Set([3, 1]))).toEqual([1, 3]);
  });
});

describe('온보딩 API 모듈', () => {
  it('GET /terms는 인증 없이도 부르는 목록 조회다', async () => {
    stubFetch([{ status: 200, body: [REQUIRED_A, OPTIONAL] }]);

    expect(await fetchTerms()).toHaveLength(2);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/terms');
  });

  it('동의 제출은 요청 한 번에 배열을 싣는다 — 항목마다 부르지 않는다', async () => {
    stubFetch([{ status: 201 }]);

    await submitConsents([1, 2, 3]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/users/me/consents');
    expect(calls[0].body).toEqual({ termsIds: [1, 2, 3] });
  });

  it('닉네임은 PATCH /users/me 재사용이고 중복이면 409 + USER_NICKNAME_DUPLICATED다', async () => {
    stubFetch([
      {
        status: 409,
        body: {
          title: 'Conflict',
          status: 409,
          detail: '이미 사용 중인 닉네임입니다.',
          instance: '/api/v1/users/me',
          code: NICKNAME_DUPLICATED_CODE,
        },
      },
    ]);

    const thrown = await updateNickname('선점된닉').catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(409);
    expect((thrown as ApiError).problem?.code).toBe(NICKNAME_DUPLICATED_CODE);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain('/users/me');
    expect(calls[0].body).toEqual({ nickname: '선점된닉' });
  });
});
