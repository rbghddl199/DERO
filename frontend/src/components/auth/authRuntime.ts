// O01 Auth Store·Adapter·returnTo를 Route 계층에 조립한다 — 실제 백엔드(ADR-0005) 전용.

import { accessTokenHolder } from '@/api/auth/accessTokenHolder';
import { createActualAuthAdapter, requestRefreshedAccessToken } from '@/api/auth/actualAdapter';
import type { AuthAdapter } from '@/api/auth/port';
import { createRefreshCoordinator } from '@/api/auth/refreshCoordinator';
import { setApiRefreshCoordinator } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { AuthFailure, AuthProvider } from '@/types/auth';
import { resolvePostLoginDestination } from '@/utils/auth/onboarding';
import { createReturnToRepository, type ReturnToRepository } from '@/utils/auth/returnToRepository';

export type AuthorizationStartResult =
  | {
      kind: 'callback';
    }
  | {
      kind: 'failure';
      failure: AuthFailure;
    };

export type CallbackCompletion =
  | {
      kind: 'success';
      returnTo: string;
    }
  | {
      kind: 'failure';
      failure: AuthFailure;
    };

interface AuthRuntimeOptions {
  returnToRepository?: ReturnToRepository;
  adapter?: AuthAdapter;
}

export interface AuthRuntime {
  bootstrapRoot(): Promise<void>;
  saveReturnTo(candidate: string | null | undefined): string;
  startAuthorization(provider: AuthProvider): Promise<AuthorizationStartResult>;
  completeCallback(): Promise<CallbackCompletion>;
  /** 세션을 서버에서 다시 읽어 store에 반영한다 — 온보딩을 마친 뒤 파생값을 갱신하는 자리. */
  refreshSession(): Promise<void>;
  logout(): Promise<void>;
}

export function createAuthRuntime(options: AuthRuntimeOptions = {}): AuthRuntime {
  const returnToRepository = options.returnToRepository ?? createReturnToRepository();
  const adapter = options.adapter ?? createActualAuthAdapter();
  let callbackCompletion: Promise<CallbackCompletion> | null = null;
  let rootBootstrap: Promise<void> | null = null;

  const applyFailure = (failure: AuthFailure): void => {
    useAuthStore.getState().handleFailure(failure);
  };

  const runRootBootstrap = async (): Promise<void> => {
    useAuthStore.getState().startLoading();

    const result = await adapter.currentSession();
    if (!result.ok) {
      applyFailure(result.failure);
      return;
    }
    if (result.data === null) {
      useAuthStore.getState().setAnonymous();
      return;
    }

    useAuthStore.getState().setAuthenticated(result.data);
  };

  const runCallback = async (): Promise<CallbackCompletion> => {
    useAuthStore.getState().startLoading();
    const result = await adapter.bootstrap();
    if (!result.ok) {
      applyFailure(result.failure);
      return { kind: 'failure', failure: result.failure };
    }

    useAuthStore.getState().setAuthenticated(result.data);
    return {
      kind: 'success',
      // 온보딩이 남아 있으면 /onboarding으로 보내되 원래 목적지를 쿼리로 넘긴다 — 저장소의
      // returnTo는 여기서 이미 소비되므로 넘기지 않으면 복구할 방법이 없다(utils/auth/onboarding).
      returnTo: resolvePostLoginDestination(
        result.data.onboardingRequired,
        returnToRepository.consume(),
      ),
    };
  };

  return {
    bootstrapRoot() {
      rootBootstrap ??= runRootBootstrap();
      return rootBootstrap;
    },

    saveReturnTo(candidate) {
      return returnToRepository.save(candidate);
    },

    async startAuthorization(provider) {
      callbackCompletion = null;

      const result = await adapter.authorize(provider);
      if (!result.ok) {
        applyFailure(result.failure);
        return { kind: 'failure', failure: result.failure };
      }
      return { kind: 'callback' };
    },

    completeCallback() {
      callbackCompletion ??= runCallback();
      return callbackCompletion;
    },

    async refreshSession() {
      const result = await adapter.refresh();
      if (!result.ok) {
        applyFailure(result.failure);
        return;
      }
      useAuthStore.getState().setAuthenticated(result.data);
    },

    async logout() {
      const result = await adapter.logout();
      if (!result.ok) {
        applyFailure(result.failure);
        return;
      }

      returnToRepository.clear();
      useAuthStore.getState().setAnonymous();
    },
  };
}

// 결정 7: apiClient의 401 자동 회전을 실제 refresh 구현과 잇는다. client.ts가 actualAdapter를
// 직접 import하면 순환(actualAdapter → client)이라, Route 계층을 조립하는 이 모듈이 부팅 시 주입한다.
// 서버 컴포넌트에서 apiClient를 쓰는 경로(/collection)는 이 모듈을 안 거치므로 주입 없이 그냥 1회 호출이다.
setApiRefreshCoordinator(
  createRefreshCoordinator({
    accessTokenHolder,
    refresh: requestRefreshedAccessToken,
    // 회전으로 회복 못 한 세션은 익명으로 되돌린다 — 진입 게이트(AuthGate)가 이 상태를 보고
    // /login?returnTo=<지금 경로>로 보낸다.
    onSessionTerminated: (failure) => {
      useAuthStore.getState().setAnonymous(failure);
    },
  }),
);

export const authRuntime = createAuthRuntime();
